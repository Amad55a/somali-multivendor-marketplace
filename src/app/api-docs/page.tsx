import { SwaggerDocumentation } from "./swagger-ui";

export const metadata = {
  title: "API Documentation | Somsuuq",
  robots: { index: false, follow: false },
};

export default function ApiDocsPage() {
  return (
    <main className="min-h-dvh bg-white">
      <header className="border-b border-slate-200 px-4 py-4 sm:px-8">
        <h1 className="text-xl font-semibold text-[#123b35]">
          Somsuuq API Documentation
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Run requests from this same origin. Successful sign-in stores the
          HttpOnly session cookie in your browser for subsequent requests.
          Swagger generates a fresh reCAPTCHA token for protected requests.
        </p>
      </header>
      <SwaggerDocumentation />
    </main>
  );
}
