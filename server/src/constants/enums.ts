export enum UserRole{
    Admin,
    User
}
export enum TokenType{
    AccessToken,
    RefreshToken,
    ForgotPasswordToken,
    EmailVerifyToken
}
export enum StatusType {
    SoldOut,
    Available
}
export enum AccountStatus {
    Active = 'Active',
    Pending = 'Pending',
    Inactive = 'Inactive',
    Banned = 'Banned',
    Locked = 'Locked'
}
