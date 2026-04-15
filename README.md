PrepSense is a simple PM interview prep web app built with Next.js + Tailwind CSS. Paste a job description, generate tailored interview questions, write answers, and score them on STAR structure, metrics, and relevance.

## Getting Started

### 1) Configure env

Create `.env.local`:

```bash
cp .env.example .env.local
```

Then set:

```bash
ANTHROPIC_API_KEY=...
```

### 2) Run the dev server

Run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### How it works

- `POST /api/analyse`: Calls Claude (model `claude-sonnet-4-20250514`) twice in sequence:
  - Step 1 extracts PM signals from the JD
  - Step 2 generates 8 tailored questions
- `POST /api/score`: Scores your answers (STAR, metrics, relevance) and returns feedback per question

### Notes

- The API key is only read server-side via `ANTHROPIC_API_KEY`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
