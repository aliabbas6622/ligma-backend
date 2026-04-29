import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import type { CookieOptions, Request, Response } from 'express';

type RequestWithCookies = Request & {
  cookies?: Record<string, string>;
};

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export function createSupabaseClient(req: Request, res: Response) {
  return createSupabaseServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries((req as RequestWithCookies).cookies ?? {}).map(
            ([name, value]) => ({ name, value }),
          );
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            if (options) {
              res.cookie(name, value, options);
              return;
            }
            res.cookie(name, value);
          });
        },
      },
    },
  );
}
