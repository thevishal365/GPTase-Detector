# GPTase Detector Frontend

A modern web interface for the AI text detection API.

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Client-side React state**

## Environment Variables

Create a `.env.local` file in the `frontend` directory:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

## Running the Frontend

```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:3000`

## Requirements

- Node.js 18+ 
- Backend API running on configured URL

## Features

- Live character count
- Loading states during analysis
- Error handling for backend unavailable
- Visual probability bars for HUMAN and AI predictions
- Word and character count display
- Responsive design (mobile and desktop)
- Clear disclaimer about probabilistic results
