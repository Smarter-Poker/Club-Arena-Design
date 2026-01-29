#!/bin/bash
# Club Arena Production Deployment Script
# This script deploys Club Arena and refreshes the World Hub proxy

set -e  # Exit on any error

echo "🚀 Starting Club Arena Production Deployment..."

# Step 1: Deploy Club Arena
echo ""
echo "📦 Step 1/2: Deploying Club Arena..."
vercel --prod --yes

# Step 2: Refresh World Hub proxy cache
echo ""
echo "🔄 Step 2/2: Refreshing World Hub proxy cache..."
cd ../Smarter-Poker-World-Hub
vercel --prod --force

echo ""
echo "✅ Deployment Complete!"
echo "🌐 Live at: https://smarter.poker/hub/club-arena/"
echo ""
echo "⚠️  Remember to hard refresh (Cmd+Shift+R) to see changes!"
