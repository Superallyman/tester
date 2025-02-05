import NextAuth, { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

// Define the authOptions using the correct type
 const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
    // ... add more providers if needed
  ],
};

// NextAuth handler
const handler = NextAuth(authOptions);

// Export handler for GET and POST requests
export { handler as GET, handler as POST };
