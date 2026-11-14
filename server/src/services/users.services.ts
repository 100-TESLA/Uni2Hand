
import User, { EmailVerificationLog, RefreshToken } from './../models/users.schemas.js';
import databaseService from "./database.services.js"
import { RegisterReqBody, GoogleRegisterReqBody, VerifyOtpReqBody } from "../models/requests/users.requests.js"
import { UserRole, TokenType, AccountStatus } from '../constants/enums.js';
import { hashPassword, sha256 } from '../utils/crypto.js';
import { signToken } from '../utils/jwt.js';
import { ObjectId } from 'mongodb';
import { verifyStudentIdentity } from './student-verification.services.js';
import { schoolCodeFromEmail } from '../data/universities.js';
import { updateStudentProfile } from './student-profile.services.js';
import { normalizeText } from '../utils/text.js';
import { verifyGoogleIdToken } from '../utils/google.js';
import { generateOtpCode, hashOtpCode, sendOtpEmail, OTP_TTL_MS, OTP_RESEND_MS } from '../utils/email.js';
import { deleteExpiredOtpRegistrations, OTP_RETENTION_SECONDS } from './otp-lifecycle.services.js';
import path from 'path'


class UserService {
    private signAccessAndRefreshToken(user_id: string) {
        return Promise.all([
            this.signAccessToken(user_id),
            this.signRefreshToken(user_id)
        ])
    }
    async logout(refresh_token: string) {
        const result = await databaseService.refreshTokens.deleteOne({ token: refresh_token })
        return result
    }
    async login(user_id: string) {
        const account = await databaseService.users.findOne({ _id: new ObjectId(user_id) })
        if (!account || account.email_verified === false || account.status === AccountStatus.Pending ||
            ['Banned', 'Locked', 'Inactive', 'pending_verification'].includes(account.status)) {
            throw new Error('Tài khoản chưa xác nhận email hoặc đã bị vô hiệu hóa.')
        }
        const [access_token, refresh_token] = await this.signAccessAndRefreshToken(user_id)
        await databaseService.refreshTokens.insertOne(
            new RefreshToken({
                user_id: new ObjectId(user_id),
                token: refresh_token,
                created_at: new Date()
            })
        )
        const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) }, { projection: { password: 0, otp_code_hash: 0, otp_expires_at: 0, otp_attempts: 0, otp_resend_at: 0 } })
        return {
            access_token,
            refresh_token,
            user
        }
    }
    async signRefreshToken(user_id: string) {
        return signToken({
            payload: {
                user_id,
                token_type: TokenType.RefreshToken
            },
            options: {
                expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN as any,
                algorithm: 'HS256'
            }
        })
    }
    async signAccessToken(user_id: string) {
        return signToken({
            payload: {
                user_id,
                token_type: TokenType.AccessToken
            },
            options: {
                expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN as any,
                algorithm: 'HS256'
            }
        })
    }
    async checkEmailExist(email: string) {
        const user = await databaseService.users.findOne({ email })
        return Boolean(user)
    }

    private async logEmailVerificationAction(payload: {
        email: string
        university_name?: string
        student_id?: string
        action: 'register' | 'resend' | 'verify' | 'failed'
        result: 'sent' | 'success' | 'failed'
        message?: string
    }) {
        await databaseService.emailVerificationLogs.insertOne(
            new EmailVerificationLog({
                ...payload,
                created_at: new Date()
            })
        ).catch(() => console.error('Unable to record email verification audit event'))
    }

    private async createAndSendOtp(user: User, action: 'register' | 'resend') {
        const now = new Date()
        const resendAt = new Date(now.getTime() + 60_000)
        const otp = generateOtpCode()
        // Reserve delivery atomically so concurrent requests respect the cooldown.
        const reserved = await databaseService.users.findOneAndUpdate({
            _id: user._id, email_verified: false, otp_is_verified: false, status: AccountStatus.Pending,
            $and: [
                { $or: [{ otp_resend_at: { $exists: false } }, { otp_resend_at: { $lte: now } }] },
                {
                    $or: [{ otp_expires_at: { $exists: false } },
                    { otp_expires_at: { $gt: new Date(now.getTime() - OTP_RETENTION_SECONDS * 1000) } }]
                }
            ]
        }, {
            $set: {
                otp_resend_at: resendAt, otp_code_hash: hashOtpCode(otp),
                otp_expires_at: new Date(now.getTime() + OTP_TTL_MS), otp_attempts: 0
            }
        }, { returnDocument: 'after' })
        if (!reserved) throw new Error('Vui lòng chờ trước khi gửi lại mã OTP.')
        try { await sendOtpEmail(user.email, otp) }
        catch (error) {
            const filter = {
                _id: user._id, email_verified: false, otp_is_verified: false,
                status: AccountStatus.Pending, google_id: null, otp_resend_at: resendAt
            }
            if (user.otp_code_hash && user.otp_expires_at) {
                // Failed resend must not invalidate a previously delivered challenge.
                await databaseService.users.updateOne(filter, {
                    $set: {
                        otp_code_hash: user.otp_code_hash, otp_expires_at: user.otp_expires_at,
                        otp_attempts: user.otp_attempts || 0
                    },
                    $unset: { otp_resend_at: '' }
                })
            } else {
                // No email delivered and no previous challenge: do not leave an orphan account.
                await databaseService.users.deleteOne(filter)
            }
            throw error
        }
        const sentAt = new Date()
        const expiresAt = new Date(sentAt.getTime() + OTP_TTL_MS)
        const nextResendAt = new Date(sentAt.getTime() + OTP_RESEND_MS)
        await databaseService.users.updateOne({ _id: user._id, email_verified: false, otp_resend_at: resendAt }, {
            $set: {
                otp_code_hash: hashOtpCode(otp), otp_expires_at: expiresAt,
                otp_resend_at: nextResendAt, otp_attempts: 0
            }
        })
        await this.logEmailVerificationAction({ email: user.email, action, result: 'sent' })
        return { email: user.email, otp_expires_at: expiresAt, resend_available_at: nextResendAt, server_time: sentAt }
    }

    async register(payload: RegisterReqBody) {
        const email = payload.email.trim().toLowerCase()
        await deleteExpiredOtpRegistrations(databaseService.users, new Date(), email)
        const existing = await databaseService.users.findOne({ email })
        if (existing) {
            const pending = (existing.email_verified === false && existing.status === AccountStatus.Pending) ||
                (existing.status as string) === 'pending_verification'
            if (pending && !existing.google_id &&
                existing.password === hashPassword(payload.password.trim())) {
                await databaseService.users.updateOne({ _id: existing._id, status: existing.status }, {
                    $set: { status: AccountStatus.Pending, email_verified: false, otp_is_verified: false }
                })
                return this.createAndSendOtp(existing, 'resend')
            }
            throw new Error('Email đã tồn tại trong hệ thống.')
        }
        const user = new User({
            username: payload.name, email, school_code: schoolCodeFromEmail(email),
            password: hashPassword(payload.password.trim()), phone_number: payload.phone_number,
            status: AccountStatus.Pending, email_verified: false, otp_is_verified: false, is_verified: false
        })
        const result = await databaseService.users.insertOne(user)
        user._id = result.insertedId
        return this.createAndSendOtp(user, 'register')
    }

    async resendOtp(payload: { email: string }) {
        await deleteExpiredOtpRegistrations(databaseService.users, new Date(), payload.email.trim().toLowerCase())
        const user = await databaseService.users.findOne({
            email: payload.email.trim().toLowerCase(),
            email_verified: false, otp_is_verified: false, status: AccountStatus.Pending, google_id: null
        })
        if (!user) throw new Error('Không có đăng ký đang chờ xác nhận cho email này.')
        return this.createAndSendOtp(user, 'resend')
    }

    async verifyOtp({ email, otp }: VerifyOtpReqBody) {
        await deleteExpiredOtpRegistrations(databaseService.users, new Date(), email.trim().toLowerCase())
        const user = await databaseService.users.findOneAndUpdate({
            email: email.trim().toLowerCase(), email_verified: false, otp_is_verified: false, status: AccountStatus.Pending,
            google_id: null, otp_expires_at: { $gt: new Date() }, otp_attempts: { $lt: 5 }
        }, { $inc: { otp_attempts: 1 } }, { returnDocument: 'after' })
        if (!user) throw new Error('Mã đã hết hạn hoặc vượt quá 5 lần thử. Vui lòng gửi lại mã OTP.')
        if (hashOtpCode(otp) !== user.otp_code_hash) throw new Error('Mã OTP không chính xác.')
        const updated = await databaseService.users.findOneAndUpdate({
            _id: user._id, email_verified: false, otp_code_hash: user.otp_code_hash,
            otp_expires_at: { $gt: new Date() }
        }, {
            $set: { email_verified: true, otp_is_verified: true, status: AccountStatus.Active },
            $unset: { otp_code_hash: '', otp_expires_at: '', otp_resend_at: '', otp_attempts: '' }
        }, { returnDocument: 'after' })
        if (!updated) throw new Error('Mã OTP đã được sử dụng hoặc thay đổi. Vui lòng thử lại.')
        await this.logEmailVerificationAction({ email: user.email, action: 'verify', result: 'success' })
        return this.login(user._id!.toString())
    }

    async getMe(user_id: string) {
        const user = await databaseService.users.findOne(
            { _id: new ObjectId(user_id) },
            {
                projection: {
                    password: 0,
                    email_verify_token: 0,
                    forgot_password_token: 0, otp_code_hash: 0, otp_expires_at: 0, otp_attempts: 0, otp_resend_at: 0
                }
            }
        )
        // Older OAuth registrations used this flag for email instead of OCR.
        if (user) user.is_verified = Boolean(user.is_verified && user.student_card_image)
        return user
    }
    async updateMe(user_id: string, payload: any) {
        return updateStudentProfile(user_id, payload)
    }

    async getAddresses(user_id: string) {
        console.log("Querying addresses for user_id:", user_id)

        const normalizedUserId = new ObjectId(user_id)
        const filter = {
            user_id: {
                $in: [user_id, normalizedUserId]
            }
        }

        const collections = [databaseService.addresses, databaseService.address]

        for (const collection of collections) {
            const addresses = await collection.find(filter).toArray()
            if (addresses.length > 0) {
                console.log("Found addresses count:", addresses.length)
                return addresses
            }
        }

        console.log("Found addresses count: 0")
        return []
    }
    async saveAddress(user_id: string, payload: any) {
        const normalizedUserId = new ObjectId(user_id)
        const filter = {
            user_id: {
                $in: [user_id, normalizedUserId]
            }
        }
        const update = {
            $set: {
                ...payload,
                user_id: normalizedUserId,
                updated_at: new Date()
            },
            $setOnInsert: {
                created_at: new Date()
            }
        }

        const result = await databaseService.addresses.updateOne(filter, update, { upsert: true })

        if (result.upsertedCount === 0 && result.matchedCount === 0) {
            const legacyResult = await databaseService.address.updateOne(
                filter,
                update,
                { upsert: true }
            )
            return legacyResult
        }
        return result
    }

    async verifyStudentCard(user_id: string, image: unknown) {
        const modelPath = path.resolve(
            process.cwd(),
            'src/models/student-card/best.onnx'
        )

        return verifyStudentIdentity(
            user_id,
            image,
            modelPath
        )
    }

    async googleAuth(idToken: string) {
        // 1. Verify Google ID token
        const payload = await verifyGoogleIdToken(idToken)

        // 2. Extract sub, email, email_verified, name, picture
        const { sub, email, email_verified, name, picture } = payload

        if (!email) {
            throw new Error('Tài khoản Google không có địa chỉ email.')
        }

        // Strict requirement: email_verified must be strictly true (not false, null, or undefined)
        if (email_verified !== true) {
            throw new Error('Email Google chưa được xác thực.')
        }

        // Normalize email/domain and strictly enforce .edu.vn
        const normalizedEmail = email.trim().toLowerCase()
        const atIndex = normalizedEmail.lastIndexOf('@')
        const domain = atIndex !== -1 ? normalizedEmail.slice(atIndex + 1) : ''
        if (!domain.endsWith('.edu.vn') || domain === 'edu.vn') {
            throw new Error('Hệ thống chỉ chấp nhận email trường học có đuôi .edu.vn.')
        }

        // 3. Find user by google_id
        let user = await databaseService.users.findOne({ google_id: sub })

        // 4. Otherwise find by email
        if (!user) {
            user = await databaseService.users.findOne({ email: normalizedEmail })
        }

        // 5. Existing user flow
        if (user) {
            // Check status (Banned, Locked, Inactive accounts are blocked; Pending accounts are permitted to authenticate)
            if (user.status === AccountStatus.Banned || (user.status as any) === 'Banned') {
                throw new Error('Tài khoản của bạn đã bị cấm. Vui lòng liên hệ quản trị viên.')
            }
            if (user.status === AccountStatus.Locked || (user.status as any) === 'Locked') {
                throw new Error('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.')
            }
            if (user.status === AccountStatus.Inactive || (user.status as any) === 'Inactive') {
                throw new Error('Tài khoản của bạn đang bị vô hiệu hóa.')
            }


            // Link google_id if necessary (strictly requiring email_verified === true)
            if (email_verified === true) {
                await databaseService.users.updateOne(
                    { _id: user._id },
                    {
                        $set: {
                            google_id: sub,
                            email_verified: true,
                            status: AccountStatus.Active,
                            // A password on an unconfirmed registration is not owned by Google yet.
                            ...((user.email_verified === false || (user.status as string) === 'pending_verification') ? { password: '' } : {}),
                            updated_at: new Date()
                        },
                        $unset: { otp_code_hash: '', otp_expires_at: '', otp_resend_at: '', otp_attempts: '' }
                    }
                )
            }

            // Reuse existing application login / token generation
            const loginResult = await this.login(user._id.toString())
            return {
                action: 'LOGIN',
                ...loginResult
            }
        }

        // 6. No existing user flow
        return {
            action: 'GOOGLE_STUDENT_REGISTRATION',
            google_user: {
                google_id: sub,
                email: normalizedEmail,
                name: name || '',
                picture: picture || ''
            }
        }
    }

    async googleRegister(payload: GoogleRegisterReqBody) {
        const { credential, school, student_id } = payload

        if (!credential) {
            throw new Error('Google credential is required.')
        }

        // 1. Verify Google ID token again
        const tokenPayload = await verifyGoogleIdToken(credential)

        // 2. Obtain identity ONLY from verified token
        const { sub, email, email_verified, name, picture } = tokenPayload

        if (!email) {
            throw new Error('Tài khoản Google không có địa chỉ email.')
        }

        // Strict requirement: email_verified must be strictly true (not false, null, or undefined)
        if (email_verified !== true) {
            throw new Error('Email Google chưa được xác thực.')
        }

        // Normalize email/domain and strictly enforce .edu.vn
        const normalizedEmail = email.trim().toLowerCase()
        const atIndex = normalizedEmail.lastIndexOf('@')
        const domain = atIndex !== -1 ? normalizedEmail.slice(atIndex + 1) : ''
        if (!domain.endsWith('.edu.vn') || domain === 'edu.vn') {
            throw new Error('Hệ thống chỉ chấp nhận email trường học có đuôi .edu.vn.')
        }

        const accountStatus = AccountStatus.Active
        const isVerified = false

        // 4 & 5. Validate school and student_id
        const trimmedSchool = school?.trim()
        const trimmedStudentId = student_id?.trim()

        if (!trimmedSchool || trimmedSchool.length < 2 || trimmedSchool.length > 200) {
            throw new Error('Trường học không hợp lệ (từ 2 đến 200 ký tự).')
        }

        if (!trimmedStudentId || trimmedStudentId.length < 5 || trimmedStudentId.length > 10) {
            throw new Error('Mã số sinh viên không hợp lệ (từ 5 đến 10 ký tự).')
        }

        // 6. Check duplicate school + student_id
        const existingStudent = await databaseService.users.findOne({
            school_code: schoolCodeFromEmail(normalizedEmail),
            student_id: trimmedStudentId.toUpperCase()
        })
        if (existingStudent) {
            throw new Error('Mã số sinh viên này đã được đăng ký tại trường này.')
        }
        const verifiedStudent = await databaseService.studentIdentities.findOne({
            school_code: schoolCodeFromEmail(normalizedEmail), student_id: trimmedStudentId.toUpperCase()
        })
        if (verifiedStudent) throw new Error('Cặp mã trường/MSSV đã được xác thực bởi tài khoản khác.')

        // 7. Check duplicate email / google_id
        const existingGoogleUser = await databaseService.users.findOne({ google_id: sub })
        if (existingGoogleUser) {
            throw new Error('Tài khoản Google này đã được liên kết với một người dùng khác.')
        }

        const existingEmailUser = await databaseService.users.findOne({ email: normalizedEmail })
        if (existingEmailUser) {
            throw new Error('Email này đã tồn tại trong hệ thống.')
        }

        // 8. Create the User
        // 9. status = Active (.edu.vn)
        // 10. Store google_id = Google sub
        // 11. Store school
        // 12. Store student_id
        // 13. Set student verification fields
        const newUser = new User({
            username: name || normalizedEmail.split('@')[0],
            email: normalizedEmail,
            avatar: picture || '',
            google_id: sub,
            school_code: schoolCodeFromEmail(normalizedEmail),
            university_name: trimmedSchool,
            student_id: trimmedStudentId.toUpperCase(),
            status: accountStatus,
            role: UserRole.User,
            is_verified: isVerified,
            email_verified: true,
            created_at: new Date()
        })

        const insertResult = await databaseService.users.insertOne(newUser)
        const newUserId = insertResult.insertedId.toString()

        // 14. Reuse existing JWT/login service
        // 15. Return the existing authentication response structure
        return await this.login(newUserId)
    }
}
const userService = new UserService()
export default userService
