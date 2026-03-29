# Clementine

AI fruit matchmaker built for Clera's coding challenge.

## Running The Full App

Reviewers should check out the top stack branch, `clementine-dashboard`, to run the complete end-to-end app.

### Prerequisites

- Docker Desktop running
- `pnpm`
- env vars in `frontend/.env.local`

Required env vars:

- `AI_GATEWAY_API_KEY`
- `TRIGGER_PROJECT_ID`
- `TRIGGER_SECRET_KEY`

### Start Locally

Run each of these in a separate terminal from the repo root unless noted otherwise:

```bash
docker rm -f cleara-surrealdb >/dev/null 2>&1 || true
mkdir -p .surreal-data
docker run -d --name cleara-surrealdb -p 8000:8000 -v "$PWD/.surreal-data:/data" surrealdb/surrealdb:v2.3.10 start --log info --user root --pass root rocksdb:/data/cleara.db
```

```bash
pnpm dlx supabase@latest start
```

```bash
pnpm dlx supabase@latest functions serve --no-verify-jwt
```

```bash
cd frontend
pnpm dev
```

```bash
cd frontend
set -a && source .env.local && set +a && pnpm trigger:dev
```

Then open:

- `http://localhost:3000`

### What Should Be Running

- Next.js frontend on `localhost:3000`
- SurrealDB on `127.0.0.1:8000`
- Supabase functions on `127.0.0.1:54321`
- Trigger.dev local worker from `frontend`

### Shutdown

```bash
docker rm -f cleara-surrealdb
pnpm dlx supabase@latest stop
```

# Coding Challenge - Matchmaking System

## Introduction

Hey! Welcome to our little take home challenge. We won't force Leetcode problems down your throat. Instead, what we do here at Clera is build, so therefore, we expect you to build cool stuff too!

But what and why are we building? Well, a lot of the world revolves around matchmaking. The fact that you and I exist is proof of that. A not so insignificant portion of what shapes a person's life is determined by matchmaking: friends, love, jobs. I mean hell, what we're doing right now at this very moment is matchmaking. Despite its prevalence, it is still quite the difficult task. So let's tackle it together—on a small scale at least. Our goal is to connect apples to oranges. Just because we shouldn't compare apples to oranges, doesn't mean we can't try to create a perfect pear… pair.

## Problem Statement

The abstract idea of the project is simple. In one basket we have apples, each apple has preferences that it wishes its orange to fulfill. In another basket we have oranges, each orange obviously also has preferences that it wishes a potential apple to meet. Our job is to:

1. Match them based on their joint preferences
2. Communicate to both parties that we've found them a match

We're going to be creating a small fullstack application that will encompass everything from frontend, edge functions as our backend and a bit of creative problem solving on your end to make this come to life.

## Tech Stack

Let me lay out the tech stack real quick before I get into more specifics.

### Frontend
- React
- Next.js
- Tailwind CSS
- Zustand
- Effect

### Backend
- Trigger.dev
- Supabase Edge Functions
- SurrealDB

### Agentic Components
- AI SDK

## Implementation Details

### Data Setup

In the `data` folder you will find a JSON file called `raw_apples_and_oranges.json`. It contains an array of apples and oranges with relevant attributes and their preferences. The first task is to create a SurrealDB instance that will hold this data. All design decisions regarding data storage are up to you, whatever helps achieve the goal best. This gives us our main pool of apples and oranges to draw from during the system's core cycle.

### Core System

Now that we have our data and access to it, we need to implement the core of our system. Two edge functions are provided: `get-incoming-apple` and `get-incoming-orange`. Both follow the same task flow:

#### Task Flow

1. **Generate a new fruit instance** ✅ *Implemented*
   - Uses `generateApple()` or `generateOrange()` from `_shared/generateFruit.ts`
   - Attributes are randomly generated using a normal distribution
   - Preferences are generated with relaxed constraints (not too strict)

2. **Capture the fruit's communication** ✅ *Implemented*
   - `communicateAttributes(fruit)` - Returns a human-readable description of the fruit's physical characteristics
   - `communicatePreferences(fruit)` - Returns a human-readable description of what the fruit is looking for in a match
   - Both functions have extensive variability with multiple templates and phrasings

3. **Store the new fruit in SurrealDB** 🔲 *TODO*
   - Connect to SurrealDB instance
   - Insert the fruit record with attributes and preferences

4. **Match the fruit to potential partners** 🔲 *TODO*
   - Query existing fruits of the opposite type from SurrealDB
   - Calculate compatibility scores based on preference matching
   - Return ranked matches

5. **Communicate matching results via LLM** 🔲 *TODO*
   - Generate natural language response about the matches
   - Include match explanations and compatibility scores if time allows

#### Running the Backend Locally

```bash
# Start Supabase local environment (from project root)
npx supabase start

# Serve edge functions (in a separate terminal)
npx supabase functions serve --no-verify-jwt

# Test the functions
curl http://127.0.0.1:54321/functions/v1/get-incoming-apple -H "Content-Type: application/json" -d '{}'
curl http://127.0.0.1:54321/functions/v1/get-incoming-orange -H "Content-Type: application/json" -d '{}'
```

#### Running the Frontend Locally

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

The frontend will be available at `http://localhost:3000`. The dashboard is at `/dashboard`.

### Visualization

To tie it all together, you will create a visualization (you may choose the medium) of this flow. In other words, it should be possible for us to "start a new conversation" and visualize the resulting "conversation".

### Metrics & Analytics

Our goal is to match as best we can, but how do I know if our solution is any good? You tell me! In the frontend application, include an admin dashboard with metrics that you can track and help convince me that the system is performing well and we are creating great pears.

## Hard Requirements

- The data must be loaded into and queried from SurrealDB
- The communication between the system and the fruits need to be visualized in a medium of your choosing
- You must communicate the matchmaking results through an LLM

## Additional Notes

- You may serve the edge functions locally.

- We encourage you to utilize AI as you see fit throughout this challenge; seeing as you will need to build many aspects of the solution quickly. Regardless of how the code is created, you will be expected to own it. This ownership includes:
  - Explaining all generated code
  - Justifying all design decisions
  - Displaying creativity in your solution

- Also feel free to change anything and everything in the template. Just because someone wrote it, doesn't mean it is right or perfect. So let's hold each other accountable and call out anything we see to keep the collective quality up and solve the problem together.

## File Structure

```
Root
├── frontend/                          # Next.js application
│   ├── app/
│   │   ├── dashboard/                 # Admin dashboard with metrics
│   │   └── page.tsx                   # Main entry point
│   └── lib/
│       ├── store.ts                   # Zustand state management
│       └── utils.ts                   # Utility functions
│
├── supabase/
│   ├── config.toml                    # Supabase local configuration
│   └── functions/
│       ├── _shared/
│       │   ├── generateFruit.ts       # Fruit generation & communication
│       │   ├── generateFruit.test.ts  # Deno tests
│       │   └── deno.json              # Shared dependencies
│       ├── get-incoming-apple/
│       │   ├── index.ts               # Apple edge function
│       │   └── deno.json
│       └── get-incoming-orange/
│           ├── index.ts               # Orange edge function
│           └── deno.json
│
├── data/
│   ├── README.md                      # Data schema documentation
│   └── raw_apples_and_oranges.json    # Seed data (40 fruits)
│
├── package.json                       # Root dependencies (supabase CLI)
└── README.md                          # This file
```
