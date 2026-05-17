import "next-auth"

declare module "next-auth" {
  interface User {
    id: string
    roles?: string[]
  }

  interface Session {
    user: {
      id: string
      email: string
      name: string
      roles: string[]
      twoFactorRequired: boolean
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    roles?: string[]
    twoFactorRequired?: boolean
  }
}
