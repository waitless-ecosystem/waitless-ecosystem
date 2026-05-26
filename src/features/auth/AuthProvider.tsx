import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../firebase/firebase";

export type PlatformRole = "superadmin" | "organization_admin" | "staff";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  platformRole: PlatformRole;
  status: "active" | "suspended";
  organizationId?: string | null;
  assignedCounterId?: string | null;
};

type AuthContextType = {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isSuperAdmin: boolean;
  isOrganizationAdmin: boolean;
  isStaff: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function logout() {
    await signOut(auth);
    setCurrentUser(null);
    setUserProfile(null);
  }

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);

      if (!user) {
        setUserProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const userRef = doc(db, "users", user.uid);

      unsubscribeProfile = onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
          setUserProfile(snapshot.data() as UserProfile);
        } else {
          setUserProfile(null);
        }

        setLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const value: AuthContextType = {
    currentUser,
    userProfile,
    loading,
    isSuperAdmin:
      userProfile?.platformRole === "superadmin" &&
      userProfile?.status === "active",
    isOrganizationAdmin:
      userProfile?.platformRole === "organization_admin" &&
      userProfile?.status === "active",
    isStaff:
      userProfile?.platformRole === "staff" && userProfile?.status === "active",
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
