import { createServerClient } from '@supabase/ssr'
import { Request, Response } from 'express'
import { Cookies } from '@supabase/ssr'

export function createServerClient(req: Request, res: Response, cookies: Cookies) {
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookies.cookies
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookie(name, value, options)
          })
        },
      },
    }
  )
}
