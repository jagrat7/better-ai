import type { SkillEntry } from "./types"

export const skills: SkillEntry[] = [
  {
    source: "vercel-labs/agent-skills",
    label: "Vercel Agent Skills",
    skills: [
      "web-design-guidelines",
      "vercel-composition-patterns",
      "vercel-react-best-practices",
    ],
    conditionalSkills: [
      {
        when: { deps: ["expo", "react-native"] },
        skills: ["vercel-react-native-skills"],
      },
    ],
    when: { deps: ["react-router-dom", "@tanstack/react-router", "@tanstack/start", "next"] },
  },
  {
    source: "vercel/ai",
    label: "Vercel AI SDK",
    skills: ["ai-sdk"],
    when: { deps: ["ai"] },
  },
  {
    source: "vercel/turborepo",
    label: "Turborepo",
    skills: ["turborepo"],
    when: { deps: ["turbo"] },
  },
  {
    source: "yusukebe/hono-skill",
    label: "Hono Backend",
    skills: ["hono"],
    when: { deps: ["hono"] },
  },
  {
    source: "vercel-labs/next-skills",
    label: "Next.js Best Practices",
    skills: ["next-best-practices", "next-cache-components"],
    when: { deps: ["next"] },
  },
  {
    source: "nuxt/ui",
    label: "Nuxt UI",
    skills: ["nuxt-ui"],
    when: { deps: ["nuxt", "@nuxt/ui"] },
  },
  {
    source: "heroui-inc/heroui",
    label: "HeroUI Native",
    skills: ["heroui-native"],
    when: { deps: ["@heroui/react"] },
  },
  {
    source: "shadcn/ui",
    label: "shadcn/ui",
    skills: ["shadcn"],
    when: { deps: ["react-router-dom", "@tanstack/react-router", "@tanstack/start", "next"] },
  },
  {
    source: "better-auth/skills",
    label: "Better Auth",
    skills: ["better-auth-best-practices"],
    when: { deps: ["better-auth"] },
  },
  {
    source: "clerk/skills",
    label: "Clerk",
    skills: [
      "clerk",
      "clerk-setup",
      "clerk-custom-ui",
      "clerk-webhooks",
      "clerk-testing",
      "clerk-orgs",
    ],
    conditionalSkills: [
      {
        when: { deps: ["next"] },
        skills: ["clerk-nextjs-patterns"],
      },
    ],
    when: { deps: ["@clerk/nextjs", "@clerk/clerk-react", "@clerk/express", "@clerk/backend"] },
  },
  {
    source: "neondatabase/agent-skills",
    label: "Neon Database",
    skills: ["neon-postgres"],
    when: { deps: ["@neondatabase/serverless"] },
  },
  {
    source: "supabase/agent-skills",
    label: "Supabase",
    skills: ["supabase-postgres-best-practices"],
    when: { deps: ["@supabase/supabase-js"] },
  },
  {
    source: "planetscale/database-skills",
    label: "PlanetScale",
    skills: ["postgres", "neki"],
    conditionalSkills: [
      {
        when: { deps: ["mysql2"] },
        skills: ["mysql", "vitess"],
      },
    ],
    when: { deps: ["@planetscale/database"] },
  },
  {
    source: "expo/skills",
    label: "Expo",
    skills: [
      "expo-dev-client",
      "building-native-ui",
      "native-data-fetching",
      "expo-deployment",
      "upgrading-expo",
      "expo-cicd-workflows",
    ],
    conditionalSkills: [
      {
        when: { deps: ["nativewind"] },
        skills: ["expo-tailwind-setup"],
      },
    ],
    when: { deps: ["expo"] },
  },
  {
    source: "prisma/skills",
    label: "Prisma",
    skills: ["prisma-cli", "prisma-client-api", "prisma-database-setup"],
    conditionalSkills: [
      {
        when: { deps: ["@prisma/extension-accelerate"] },
        skills: ["prisma-postgres"],
      },
    ],
    when: { deps: ["prisma", "@prisma/client"] },
  },
  {
    source: "elysiajs/skills",
    label: "ElysiaJS",
    skills: ["elysiajs"],
    when: { deps: ["elysia"] },
  },
  {
    source: "waynesutton/convexskills",
    label: "Convex",
    skills: [
      "convex-best-practices",
      "convex-functions",
      "convex-schema-validator",
      "convex-realtime",
      "convex-http-actions",
      "convex-cron-jobs",
      "convex-file-storage",
      "convex-migrations",
      "convex-security-check",
    ],
    when: { deps: ["convex"] },
  },
  {
    source: "msmps/opentui-skill",
    label: "OpenTUI Platform",
    skills: ["opentui"],
    when: { deps: ["opentui"] },
  },
  {
    source: "haydenbleasel/ultracite",
    label: "Ultracite",
    skills: ["ultracite"],
    when: { deps: ["ultracite"] },
  },
]
