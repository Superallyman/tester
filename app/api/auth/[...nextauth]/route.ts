import NextAuth, { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
// import CredentialsProvider from "next-auth/providers/credentials"

// Define the authOptions using the correct type
const authOptions: NextAuthOptions = {
  providers: [
    // CredentialsProvider({
    //   name: "Credentials",
    //   credentials: {
    //     username: {
    //       label: "Username:",
    //       type: "text",
    //       placeholder: "your cool username",
    //     },
    //     password: {
    //       label: "Password:",
    //       type: "password",
    //       placeholder: "your smart password",
    //     },
    //   },
    //   async authorize(credentials: Record<"username" | "password", string> | undefined) {
    //     // This is where you need to retrieve user data
    //     //to verify with credentials
    //     //Docs: https://next-auth.js.org/configuration/providers/credentials
    //     const user = { id: "69", name: "Ally", password: "password" };

    //     if (credentials?.username === user.name && credentials?.password === user.password) {
    //       return user;
    //     } else {
    //       return null;
    //     }
    //   },
    // }),
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
