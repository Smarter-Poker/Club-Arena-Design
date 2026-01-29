# Club Arena - UI Design Sandbox

## 🎨 Purpose
This is an **isolated UI sandbox** for Club Arena design work. It contains only frontend components and uses mock data.

## ⚠️ Security Notice
- **NO backend API access**
- **NO database connections**
- **NO production credentials**
- **Uses MOCK DATA ONLY** (see `src/mock_data.ts`)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## 📁 Structure

```
club_arena_sandbox/
├── src/
│   ├── components/     # UI components
│   ├── styles/         # CSS and styling
│   ├── assets/         # Images, fonts, etc.
│   ├── mock_data.ts    # Mock data for UI development
│   └── ...
├── public/             # Static assets
├── .env.local          # Environment variables (public only)
└── package.json
```

## 🎯 Mock Data

All data is hardcoded in `src/mock_data.ts`. This includes:
- Mock poker club information
- 6 mock players with chips, positions, cards
- Mock table state with pot and community cards
- Mock leaderboard and member statistics

## 🔒 What's NOT Included

- API routes or backend logic
- Database connections or queries
- Service role keys or admin credentials
- Real user data or authentication

## 💡 Development Tips

1. All components read from `mock_data.ts`
2. No API calls will work (they're not included)
3. Focus on UI/UX design and styling
4. Test responsive layouts and interactions

## 📝 License

This is a private sandbox for design work only.
