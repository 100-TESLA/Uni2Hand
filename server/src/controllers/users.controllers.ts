import { Request, Response } from "express"
import userService from "../services/users.services.js"
import { StudentCardError } from "../utils/student-card-errors.js"

export const loginController = async (req: Request, res: Response) => {
    try {
        const { user }: any = req
        const user_id = user._id
        const result = await userService.login(user_id.toString())
        return res.status(200).json({
            message: 'Login success',
            result
        })
    } catch (error: any) {
        const message = error.message || 'Login failed'
        return res.status(400).json({
            message,
            error: message
        })
    }
}
export const registerController= async (req: Request, res: Response) => {
    try {
        const result = await userService.register(req.body);
        return res.status(200).json({
            message: 'Register success',
            result 
        })
    } catch (error: any) {
        const statusCode = error.message?.includes('Email') || error.message?.includes('Cặp') ? 400 : 500
        return res.status(statusCode).json({
            message: 'Register failed',
            error: error.message
        })
    }
}

export const verifyOtpController = async (req: Request, res: Response) => {
    try {
        const result = await userService.verifyOtp(req.body)
        return res.status(200).json({
            message: 'OTP verification success',
            result
        })
    } catch (error: any) {
        return res.status(400).json({
            message: error.message || 'OTP verification failed'
        })
    }
}

export const resendOtpController = async (req: Request, res: Response) => {
    try {
        const result = await userService.resendOtp(req.body)
        return res.status(200).json({
            message: 'Resend OTP success',
            result
        })
    } catch (error: any) {
        return res.status(400).json({
            message: error.message || 'Resend OTP failed'
        })
    }
}

export const logoutController= async (req: Request, res: Response) => { 
        const {refresh_token} = req.body
        const result = await userService.logout(refresh_token)
        return res.json({
            message: 'Logout success'
        })
}

export const getMeController = async (req: Request, res: Response) => {
    const { decoded_authorization } = req as any
    const user_id = decoded_authorization.user_id
    const user = await userService.getMe(user_id)
    return res.json({
        message: 'Get profile success',
        result: user
    })
}

export const updateMeController = async (req: Request, res: Response) => {
    try {
    const { decoded_authorization } = req as any
    const user_id = decoded_authorization.user_id
    const body = req.body
    const result = await userService.updateMe(user_id, body)
    return res.json({
        message: 'Update profile success',
        result
    })
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Không thể lưu hồ sơ.' })
    }
}

export const getAddressesController = async (req: Request, res: Response) => {
    const { decoded_authorization } = req as any
    const user_id = decoded_authorization.user_id
    const addresses = await userService.getAddresses(user_id)
    return res.json({
        message: 'Get addresses success',
        result: addresses
    })
}

export const saveAddressController = async (req: Request, res: Response) => {
    const { decoded_authorization } = req as any
    const user_id = decoded_authorization.user_id
    const body = req.body
    const result = await userService.saveAddress(user_id, body)
    return res.json({
        message: 'Save address success',
        result
    })
}

export const verifyStudentCardController = async (req: Request, res: Response) => {
    try {
        const { decoded_authorization } = req as any
        const user_id = decoded_authorization.user_id
        const { image } = req.body
        const result = await userService.verifyStudentCard(user_id, image)
        return res.json({
            message: 'Xác thực thẻ sinh viên thành công!',
            result
        })
    } catch (error: any) {
        return res.status(400).json({
            message: error.message || 'Xác thực thất bại',
            ...(error instanceof StudentCardError ? { code: error.code } : {})
        })
    }
}

export const googleAuthController = async (req: Request, res: Response) => {
    try {
        const idToken = req.body.id_token || req.body.idToken
        const result = await userService.googleAuth(idToken)

        if (result.action === 'LOGIN') {
            return res.json({
                message: 'Login success',
                result
            })
        }

        if (result.action === 'GOOGLE_STUDENT_REGISTRATION') {
            return res.json({
                message: 'Google student registration required',
                result
            })
        }

        return res.json({
            message: 'Student card verification required',
            result
        })
    } catch (error: any) {
        return res.status(400).json({
            message: error.message || 'Google authentication failed'
        })
    }
}

export const googleRegisterController = async (req: Request, res: Response) => {
    try {
        const { credential, school, student_id } = req.body
        const token = credential || req.body.id_token || req.body.idToken
        const result = await userService.googleRegister({
            credential: token,
            school,
            student_id
        })
        return res.json({
            message: 'Register success',
            result
        })
    } catch (error: any) {
        return res.status(400).json({
            message: error.message || 'Google registration failed'
        })
    }
}


