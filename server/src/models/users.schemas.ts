import { ObjectId } from 'mongodb'
import { UserRole, AccountStatus } from '../constants/enums.js'

interface EmailVerificationLogType {
    _id?: ObjectId
    email: string
    university_name?: string
    student_id?: string
    action: 'register' | 'resend' | 'verify' | 'failed'
    result: 'sent' | 'success' | 'failed'
    message?: string
    created_at: Date
}

interface UserType {
    _id?: ObjectId
    avatar?: string
    first_name?: string
    last_name?: string
    username: string
    email: string
    student_id?: string
    university_name?: string
    school_code?: string
    address?: string
    role?: UserRole
    password?: string
    phone_number?: string
    email_verify_token?: string
    otp_code_hash?: string | null
    otp_expires_at?: Date
    otp_resend_at?: Date
    otp_attempts?: number
    otp_is_verified?: boolean
    email_verified?: boolean
    is_verified?: boolean
    badge?: string
    student_card_image?: string
    google_id?: string | null
    school?: string
    status?: AccountStatus
    created_at?: Date
}

interface EmailVerificationLogType {
    _id?: ObjectId
    email: string
    university_name?: string
    student_id?: string
    action: 'register' | 'resend' | 'verify' | 'failed'
    result: 'sent' | 'success' | 'failed'
    message?: string
    created_at: Date
}

export default class User {
    _id?: ObjectId
    avatar?: string
    first_name: string
    last_name: string
    username: string
    email: string
    student_id?: string
    university_name?: string
    school_code?: string
    address?: string
    profile_revision?: number | null
    ocr_retry_at?: Date
    ocr_verification_version?: number
    password?: string
    role: UserRole
    phone_number: string
    email_verify_token: string
    otp_code_hash?: string | null
    otp_expires_at?: Date
    otp_resend_at?: Date
    otp_attempts?: number
    otp_is_verified: boolean
    email_verified?: boolean
    is_verified: boolean
    student_card_image: string
    google_id?: string | null
    school?: string
    status: AccountStatus
    badge: string
    created_at?: Date
    constructor(user: UserType){
        this._id = user._id
        this.avatar = user.avatar || '' //Default avatar
        this.first_name = user.first_name || ''
        this.last_name = user.last_name || ''
        this.username = user.username
        this.school_code = user.school_code
        this.address = user.address || ''
        this.email = user.email
        this.email_verified = user.email_verified ?? false
        this.otp_is_verified = user.otp_is_verified ?? false
        if (user.otp_code_hash) this.otp_code_hash = user.otp_code_hash
        this.otp_expires_at = user.otp_expires_at
        this.badge = user.badge || ''
        if (user.university_name) this.university_name = user.university_name
        this.password = user.password || ''
        this.phone_number = user.phone_number || ''
        this.email_verify_token = user.email_verify_token || ''
        this.is_verified = user.is_verified || false
        this.student_card_image = user.student_card_image || ''
        if (user.google_id) {
            this.google_id = user.google_id
        }
        if (user.school) {
            this.school = user.school
        }
        if (user.student_id) {
            this.student_id = user.student_id
        }
        this.status = user.status || AccountStatus.Active
        this.created_at = user.created_at || new Date()
        this.role = user.role || UserRole.User
    }
}
interface RefreshTokenType {
    _id?: ObjectId
    user_id: ObjectId
    token: string
    created_at: Date
    iat?: number 
    exp?: number 
}
export class RefreshToken {
    _id?: ObjectId
    user_id: ObjectId
    token: string
    created_at: Date
    iat?: number 
    exp?: number 
    constructor(refreshToken: RefreshTokenType) {
        this._id = refreshToken._id
        this.user_id = refreshToken.user_id
        this.token = refreshToken.token
        this.created_at = refreshToken.created_at || new Date()
        this.iat = refreshToken.iat
        this.exp = refreshToken.exp
    }
}

export class EmailVerificationLog {
    _id?: ObjectId
    email: string
    university_name?: string
    student_id?: string
    action: 'register' | 'resend' | 'verify' | 'failed'
    result: 'sent' | 'success' | 'failed'
    message?: string
    created_at: Date

    constructor(log: EmailVerificationLogType) {
        this._id = log._id
        this.email = log.email
        this.university_name = log.university_name
        this.student_id = log.student_id
        this.action = log.action
        this.result = log.result
        this.message = log.message
        this.created_at = log.created_at || new Date()
    }
}

interface Address{
    _id: ObjectId
    user_id: string
    tittle: string
    address_line_1: string
    address_line_2?: string
    city: string
    ward: string
    campus? : string
    phone_number: string
    created_at: Date
}
interface Categories{
    _id: ObjectId
    name: string
    description: string
    created_at: Date
    deleted_at: Date
}
interface Sub_categories {
    _id: ObjectId
    parent_id: string
    name: string
    description: string
    created_at: Date
    deleted_at: Date
}
interface Product {
    _id: ObjectId
    name: string
    description: string
    summary: string
    cover: string
    sku: string
    price: Number
    category_id: string
    created_at: Date
    deleted_at: Date
}
interface Product_skus{
    _id: ObjectId
    product_id: ObjectId
    size_attribute_id: ObjectId
    color_attribute_id: ObjectId
    sku: string
    price: Number
    quantity: Number
    created_at: Date
    deleted_at: Date
}
interface Product_attributes{
    _id: ObjectId
    value: string
    created_at: Date
    deleted_at: Date
}
interface Wishlist{
    _id: ObjectId
    product_id: string
    user_id: string
    created_at: string
    deleted_at: string
}
interface Cart{
    _id: ObjectId
    user_id: ObjectId
    total: Number
    created_at: Date
    deleted_at: Date
}
interface Cart_item {
    _id: ObjectId
    cart_id: ObjectId
    product_id: ObjectId
    product_sku_id: ObjectId
    quantity: Number
    created_at: Date
    deleted_at: Date
}
interface Payment_details{
    _id: ObjectId
    order_id: ObjectId
    amount: Number
    provider: string
    status: string
    created_at: Date
    updated_at: Date
}
interface Order_details{
    _id: ObjectId
    user_id: ObjectId
    payment_id: ObjectId
    total: Number
    created_at: Date
    updated_at: Date
}
interface Order_item {
    _id: ObjectId
    product_id: ObjectId
    product_sku_id: ObjectId
    quantity: Number
    created_at: Date
    updated_at: Date
}
