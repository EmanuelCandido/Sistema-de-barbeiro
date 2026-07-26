import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, db, firebaseConfigured } from "../lib/firebase";
import type { AdminUser } from "../types";
type AuthContext={loading:boolean;user:User|null;profile:AdminUser|null;denied:boolean};
const Context=createContext<AuthContext>({loading:true,user:null,profile:null,denied:false});
export function OwnerAuthProvider({children}:{children:ReactNode}){const[state,setState]=useState<AuthContext>({loading:true,user:null,profile:null,denied:false});useEffect(()=>{if(!firebaseConfigured){setState({loading:false,user:null,profile:null,denied:false});return undefined}return onAuthStateChanged(auth,async user=>{if(!user)return setState({loading:false,user:null,profile:null,denied:false});try{const snapshot=await getDoc(doc(db,"users",user.uid));const profile=snapshot.exists()?snapshot.data() as AdminUser:null;if(!profile||profile.role!=="owner"||!profile.active){await signOut(auth);setState({loading:false,user:null,profile:null,denied:true});return}setState({loading:false,user,profile,denied:false})}catch{setState({loading:false,user:null,profile:null,denied:true})}})},[]);return <Context.Provider value={state}>{children}</Context.Provider>}
export const useOwnerAuth=()=>useContext(Context);
