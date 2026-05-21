// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB2sosYk1sNuth3qFZ3pdZFOnh9rtsxzjY",
  authDomain: "aromagrano.firebaseapp.com",
  projectId: "aromagrano",
  storageBucket: "aromagrano.firebasestorage.app",
  messagingSenderId: "369544740782",
  appId: "1:369544740782:web:4b2a36f115222066f3923f",
  measurementId: "G-VC189BH75F"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
