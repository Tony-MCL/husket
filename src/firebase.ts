import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBgtEZp3MLwm7QzfZOD355gKMknddE76vk",
  authDomain: "husket-sky.firebaseapp.com",
  projectId: "husket-sky",
  storageBucket: "husket-sky.appspot.com",
  messagingSenderId: "384866833179",
  appId: "1:384866833179:web:24e4061fd6a12ae48739be"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "europe-west1");
export const storage = getStorage(app);
