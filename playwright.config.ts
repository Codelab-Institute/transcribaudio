import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

// Every external call (Supabase, AssemblyAI, Groq) is mocked in the browser
// with page.route, so these values only need to satisfy env validation. They
// take precedence over .env.local, so a local run never touches real services.
const testEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://supabase.test",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  ASSEMBLYAI_API_KEY: "test-assemblyai-key",
  GROQ_API_KEY: "test-groq-key",
  CRON_SECRET: "test-cron-secret-0123456789",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["microphone"],
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
      },
    },
  ],
  webServer: {
    // A production build: dev can't run alongside an existing `next dev`
    command: `npx next build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: testEnv,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
