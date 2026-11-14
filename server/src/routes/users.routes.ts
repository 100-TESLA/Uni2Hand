import { wrapAsync } from './../utils/handlers.js';
import { validate } from './../utils/validation.js';
import { Router } from "express"
import { loginValidator, refreshTokenValidator, registerValidator, googleAuthValidator, googleRegisterValidator, verifyOtpValidator, resendOtpValidator } from "../middleware/users.middleware.js"
import { loginController, registerController, logoutController, getMeController, updateMeController, getAddressesController, saveAddressController, verifyStudentCardController, googleAuthController, googleRegisterController, verifyOtpController, resendOtpController } from "../controllers/users.controllers.js"
import { accessTokenValidator } from '../middleware/auth.middlewares.js';
export const userRouter= Router()

userRouter.post('/login', validate(loginValidator), wrapAsync(loginController))
userRouter.post('/register', validate(registerValidator), wrapAsync(registerController))
userRouter.post('/google-auth', googleAuthValidator, wrapAsync(googleAuthController))
userRouter.post('/google-register', googleRegisterValidator, wrapAsync(googleRegisterController))

userRouter.post('/verify-otp', validate(verifyOtpValidator), wrapAsync(verifyOtpController))
userRouter.post('/resend-otp', validate(resendOtpValidator), wrapAsync(resendOtpController))

userRouter.post('/logout', accessTokenValidator, refreshTokenValidator, wrapAsync(logoutController))

userRouter.get('/me', accessTokenValidator, wrapAsync(getMeController))
userRouter.patch('/me', accessTokenValidator, wrapAsync(updateMeController))
userRouter.get('/me/addresses', accessTokenValidator, wrapAsync(getAddressesController))
userRouter.post('/me/address', accessTokenValidator, wrapAsync(saveAddressController))
userRouter.post('/me/verify-student-card', accessTokenValidator, wrapAsync(verifyStudentCardController))
