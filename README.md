AVE Commercial Tracker

This project is a React-based application for Added Value Enterprises Ltd. to track commercial income, budgets, and partners. It uses Firebase Firestore for real-time data storage and is built to be deployed on Vercel.

How to Deploy (Vercel)

Create GitHub Repo: Create a new (private or public) repository on GitHub and push all these files to it.

Import to Vercel: Log in to your Vercel account, select "Add New... Project," and import the repository you just created.

Configure Project: Vercel will automatically detect this as a Vite project. You don't need to change any build settings.

Add Environment Variables (CRITICAL):

In your Vercel project's settings, go to the "Environment Variables" section.

You need to add the following variables. You must prefix them with VITE_ so the application can access them.

Name

Value

VITE_APP_ID

Your unique App ID (e.g., ave-commercial-tracker)

VITE_FIREBASE_CONFIG

The entire Firebase config object, copied as a single line of JSON.

VITE_AUTH_TOKEN

(Optional) Your Firebase custom auth token, if you use one.

Example for VITE_FIREBASE_CONFIG:
Your value should look like this (all on one line):
{"apiKey":"AIza...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}

Deploy: Redeploy the project in Vercel for the environment variables to take effect. Your site will be live!

Local Development

Install Dependencies:

npm install


Create .env.local file:

In the root folder, create a file named .env.local.

Add your variables (same as above, but you can format the JSON):

VITE_APP_ID=my-local-app-id

VITE_FIREBASE_CONFIG={"apiKey":"...","authDomain":"...","projectId":"..."}

VITE_AUTH_TOKEN=...


Run the App:

npm run dev


This will open the app on http://localhost:5173.