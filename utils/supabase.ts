//this is the new version of the file which stops supabase from using a stale token since we are on the server side only

import { createClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

const isServer = typeof window === 'undefined';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      // If we are on the server, we MUST disable persistence and auto-refresh
      persistSession: !isServer, 
      autoRefreshToken: !isServer,
      detectSessionInUrl: !isServer,
    },
  }
);

// below is the previous version of this file


// import { createClient } from '@supabase/supabase-js';

// if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
//   throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
// }
// if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
//   throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
// }

// export const supabase = createClient(
//   process.env.NEXT_PUBLIC_SUPABASE_URL,
//   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
//   {
//     auth: {
//       persistSession: true,
//       autoRefreshToken: true,
//     },
//     global: {
//       headers: {
//         'Content-Type': 'application/json',
//         'Accept': 'application/json',
//         'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
//       },
//     },
//     db: {
//       schema: 'public'
//     }
//   }
// ); 