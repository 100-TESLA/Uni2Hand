export interface RegisterReqBody {
    name: string,
    email: string,
    password: string,
    confirm_password: string,
    phone_number: string
}

export interface GoogleAuthReqBody {
    id_token?: string
    idToken?: string
}

export interface GoogleRegisterReqBody {
    credential: string
    school: string
    student_id: string
}


export interface VerifyOtpReqBody { email: string; otp: string }
