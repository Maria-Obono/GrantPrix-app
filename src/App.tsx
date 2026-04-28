import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Toaster, toast } from 'sonner';
import { loadStripe } from '@stripe/stripe-js';

// --- Icons ---
import { 
  Search, 
  MapPin, 
  Calendar, 
  Globe, 
  Award, 
  Clock, 
  ExternalLink, 
  Bell, 
  ChevronRight,
  Plane,
  Hotel,
  Ticket,
  CheckCircle2,
  Filter,
  X,
  Sparkles,
  Loader2,
  LogIn,
  LogOut,
  User,
  Plus,
  Cpu,
  Database,
  TrendingUp,
  Activity,
  CheckCircle,
  FileText,
  Share2,
  Zap,
  Target,
  Heart,
  ShieldCheck,
  MessageSquare,
  BrainCircuit,
  Settings,
  Shield,
  CreditCard,
  DollarSign,
  Smartphone,
  Key,
  Trash2,
  HelpCircle,
  Mail
} from 'lucide-react';

// --- Local Imports ---
import { CONFERENCES as STATIC_CONFERENCES, SUCCESS_STORIES } from './constants';
import { Conference, Region, LocationType, FundingType, AppNotification, Review, UserProfile, ApplicationStatus, UserApplication } from './types';
import { getGrantAdvice, searchConferences, verifyGrantStatus, autofillOpportunity, assistApplication } from './services/gemini';
import { auth, db } from './firebase';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';
import { compressImage } from './lib/image-utils';
import { Logo } from './components/Logo';

// --- Firebase Auth ---
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  deleteUser,
  User as FirebaseUser 
} from 'firebase/auth';

// --- Firebase Firestore ---
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  query, 
  where, 
  orderBy,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDocFromServer,
  updateDoc
} from 'firebase/firestore';

// --- Utilities ---
const isDeadlineSoon = (deadline: string) => {
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const diffTime = deadlineDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 && diffDays <= 30;
};

const getGrantStatus = (conf: Conference) => {
  const now = new Date();
  const deadlineDate = new Date(conf.grantDeadline);
  
  if (deadlineDate < now) {
    const fourMonthsAgo = new Date();
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
    if (deadlineDate < fourMonthsAgo) return 'coming-soon';
    return 'closed';
  }
  
  // If deadline is more than 6 months away, it's likely coming soon
  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
  if (deadlineDate > sixMonthsFromNow) return 'coming-soon';

  if (conf.isComingSoon) return 'coming-soon';
  return 'open';
};

const DEFAULT_AVATAR = 'https://picsum.photos/seed/avatar/200/200';
const DEFAULT_GRANT_IMAGE = 'https://picsum.photos/seed/conference/800/450';

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-space-bg flex flex-col items-center justify-center p-6 text-center selection:bg-lime-accent selection:text-space-bg">
          <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center text-red-500 mb-8 animate-pulse">
            <Shield size={40} />
          </div>
          <h1 className="text-4xl font-bold tracking-tighter uppercase text-white mb-4">System Malfunction</h1>
          <p className="text-xs font-bold uppercase tracking-widest text-white/40 max-w-md mb-12">
            An unexpected error has occurred in the GrantPrix core. Our engineers have been notified.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="btn-lime px-12 py-4"
          >
            Reboot System
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Loading View ---
function LoadingView() {
  return (
    <div className="min-h-screen bg-space-bg flex flex-col items-center justify-center p-6 text-center selection:bg-lime-accent selection:text-space-bg">
      <div className="relative w-24 h-24 mb-12">
        <div className="absolute inset-0 border-4 border-lime-accent/10 rounded-full" />
        <div className="absolute inset-0 border-4 border-lime-accent rounded-full border-t-transparent animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-lime-accent">
          <Zap size={32} className="animate-pulse" />
        </div>
      </div>
      <h1 className="text-2xl font-bold tracking-tighter uppercase text-white mb-2">Initializing GrantPrix</h1>
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 animate-pulse">
        Syncing with global grant databases...
      </p>
    </div>
  );
}

// --- Not Found View ---
function NotFoundView({ onHome }: { onHome: () => void }) {
  return (
    <div className="min-h-screen bg-space-bg flex flex-col items-center justify-center p-6 text-center selection:bg-lime-accent selection:text-space-bg">
      <div className="w-20 h-20 bg-lime-accent/10 rounded-3xl flex items-center justify-center text-lime-accent mb-8">
        <HelpCircle size={40} />
      </div>
      <h1 className="text-4xl font-bold tracking-tighter uppercase text-white mb-4">404: Grant Not Found</h1>
      <p className="text-xs font-bold uppercase tracking-widest text-white/40 max-w-md mb-12">
        The opportunity you are looking for has either expired or moved to a different sector.
      </p>
      <button 
        onClick={onHome}
        className="btn-lime px-12 py-4"
      >
        Return to Base
      </button>
    </div>
  );
}

function NotificationPreferencesView({ onBack }: { onBack: () => void }) {
  const [prefs, setPrefs] = useState({
    email: true,
    push: true,
    realtime: true,
    marketing: false
  });

  return (
    <div className="min-h-screen bg-space-bg text-white font-sans p-6 md:p-12 selection:bg-lime-accent selection:text-space-bg">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 bg-lime-accent/10 rounded-2xl flex items-center justify-center text-lime-accent">
            <Bell size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tighter uppercase">Notification Preferences</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mt-1">Configure your alert system</p>
          </div>
        </div>

        <div className="space-y-4">
          {[
            { id: 'realtime', name: 'Real-time Grant Alerts', description: 'Get notified the second a new grant matches your profile', icon: <Zap size={18} />, pro: true },
            { id: 'email', name: 'Email Digest', description: 'Weekly summary of upcoming deadlines', icon: <FileText size={18} /> },
            { id: 'push', name: 'Browser Push Notifications', description: 'Quick alerts for saved grant updates', icon: <Bell size={18} /> },
            { id: 'marketing', name: 'Product Updates', description: 'News about new features and community stories', icon: <Sparkles size={18} /> },
          ].map((opt) => (
            <div key={opt.id} className="bento-card p-6 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/5 rounded-xl text-white/40 group-hover:text-lime-accent transition-colors">
                  {opt.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest">{opt.name}</span>
                    {opt.pro && (
                      <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 bg-lime-accent/10 text-lime-accent rounded-full border border-lime-accent/20">Pro</span>
                    )}
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mt-1">{opt.description}</p>
                </div>
              </div>
              <button 
                onClick={() => setPrefs(prev => ({ ...prev, [opt.id]: !prev[opt.id as keyof typeof prev] }))}
                className={`w-12 h-6 rounded-full transition-all relative ${prefs[opt.id as keyof typeof prefs] ? 'bg-lime-accent' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-space-bg transition-all ${prefs[opt.id as keyof typeof prefs] ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-12 flex gap-4">
          <button 
            onClick={() => {
              toast.success("Preferences synced successfully!");
              setTimeout(onBack, 1500);
            }}
            className="btn-lime flex-1 py-4"
          >
            Save & Sync
          </button>
          <button 
            onClick={onBack}
            className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all"
          >
            Close Tab
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // Routing for new tab pages
  if (window.location.pathname === '/settings/notifications') {
    return (
      <>
        <Toaster position="top-center" theme="dark" />
        <NotificationPreferencesView onBack={() => window.close()} />
      </>
    );
  }

  // --- State: Authentication & User Profile ---
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // --- State: Navigation & UI ---
  const [view, setView] = useState<'landing' | 'home' | 'login' | 'signup' | 'welcome' | 'profile' | 'sectors' | 'success-stories' | 'about' | 'share-opportunity' | 'admin' | 'verify-email' | 'grant-details'>('landing');
  const [selectedGrant, setSelectedGrant] = useState<Conference | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<Region | 'All'>('All');
  const [selectedLocationType, setSelectedLocationType] = useState<LocationType | 'All'>('All');
  const [selectedFundingType, setSelectedFundingType] = useState<FundingType | 'All'>('All');
  const [selectedDeadline, setSelectedDeadline] = useState<'All' | 'Urgent' | 'Upcoming'>('All');
  const [selectedField, setSelectedField] = useState<string>('All');
  const [selectedCoverage, setSelectedCoverage] = useState<'All' | 'Flight' | 'Hotel' | 'Ticket' | 'Stipend'>('All');
  const [activeTab, setActiveTab] = useState<'all' | 'saved'>('all');
  const [visibleCountLanding, setVisibleCountLanding] = useState(6);
  const [visibleCountDashboard, setVisibleCountDashboard] = useState(6);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [showSubscription, setShowSubscription] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [email, setEmail] = useState('');
  const [isUpgrading, setIsUpgrading] = useState(false);
  
  // --- State: Firestore Data ---
  const [dbConferences, setDbConferences] = useState<Conference[]>([]);
  const [approvedSubmissions, setApprovedSubmissions] = useState<any[]>([]);
  const [isDbLoading, setIsDbLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);

  // --- Memoized Data: Deduplicated Conferences ---
  const allConferences = useMemo(() => {
    const merged = [...STATIC_CONFERENCES, ...dbConferences, ...approvedSubmissions];
    const deduplicatedMap = new Map<string, Conference>();
    merged.forEach(conf => {
      const name = (conf.name || '').toLowerCase().trim();
      
      const existing = deduplicatedMap.get(name);
      if (!existing) {
        deduplicatedMap.set(name, conf);
      } else {
        const timeA = existing.createdAt ? (typeof existing.createdAt === 'string' ? new Date(existing.createdAt).getTime() : (existing.createdAt as any).toMillis?.() || 0) : 0;
        const timeB = conf.createdAt ? (typeof conf.createdAt === 'string' ? new Date(conf.createdAt).getTime() : (conf.createdAt as any).toMillis?.() || 0) : 0;
        if (timeB > timeA) {
          deduplicatedMap.set(name, conf);
        }
      }
    });
    return Array.from(deduplicatedMap.values()).filter(conf => {
      const normalizedName = (conf.name || '').toLowerCase().trim();
      // Aggressively filter out any conference that contains these specific strings
      const isUnwanted = normalizedName.includes('woman in tech global conference') || 
                         normalizedName.includes('women in tech global conference') ||
                         (normalizedName.includes('woman in tech') && normalizedName.includes('global conference')) ||
                         (normalizedName.includes('women in tech') && normalizedName.includes('global conference'));
      return !isUnwanted;
    });
  }, [dbConferences, approvedSubmissions]);

  // --- State: AI Assistant ---
  const [selectedConfForAI, setSelectedConfForAI] = useState<Conference | null>(null);
  const [userBackground, setUserBackground] = useState('');
  const [aiAdvice, setAiAdvice] = useState('');
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- Effect: Scroll Restoration ---
  useEffect(() => {
    if (view === 'home') {
      window.scrollTo(0, scrollPosition);
    }
  }, [view]);

  // --- Effect: Smart Deadline Reminders (Pro Feature) ---
  useEffect(() => {
    if (!user || !userProfile?.isPremium || !allConferences.length) return;

    const checkReminders = () => {
      const trackedApps = userProfile.applications || [];
      const now = new Date();
      const newNotifications: AppNotification[] = [];

      trackedApps.forEach(app => {
        const conference = allConferences.find(c => c.id === app.conferenceId);
        if (!conference || app.status === ApplicationStatus.APPLIED || app.status === ApplicationStatus.ACCEPTED || app.status === ApplicationStatus.REJECTED) return;

        const deadline = new Date(conference.grantDeadline);
        const diffTime = deadline.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let message = "";
        let type: 'info' | 'warning' | 'success' = 'info';

        if (diffDays === 7) {
          message = `Strategic Nudge: 7 days left to apply for ${conference.name}! Time to polish that essay.`;
          type = 'info';
        } else if (diffDays === 3) {
          message = `Strategic Nudge: Only 3 days left for ${conference.name}. Don't miss out!`;
          type = 'warning';
        } else if (diffDays === 1) {
          message = `Last Chance: ${conference.name} deadline is TOMORROW! Submit now.`;
          type = 'warning';
        }

        if (message) {
          const notificationId = `deadline-${app.conferenceId}-${diffDays}`;
          // Check if already notified (simple local check for now, ideally in DB)
          const alreadyNotified = notifications.some(n => n.id === notificationId);
          
          if (!alreadyNotified) {
            newNotifications.push({
              id: notificationId,
              userId: user.uid,
              title: 'Smart Deadline Reminder',
              message,
              type: 'deadline_reminder',
              createdAt: now.toISOString(),
              isRead: false
            });
          }
        }
      });

      if (newNotifications.length > 0) {
        setNotifications(prev => [...newNotifications, ...prev]);
      }
    };

    checkReminders();
  }, [user, userProfile?.isPremium, allConferences, userProfile?.applications]);

  // --- Effect: Authentication & Profile Listener ---
  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);

      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      if (currentUser) {
        setEmail(currentUser.email || '');
        
        // Check if email is verified
        if (!currentUser.emailVerified) {
          setView('verify-email');
        }

        // Real-time profile listener
        const profileRef = doc(db, 'users', currentUser.uid);
        profileUnsubscribe = onSnapshot(profileRef, async (snapshot) => {
          if (snapshot.exists()) {
            const profile = snapshot.data() as UserProfile;
            
            // Handle verification status sync
            if (profile.isVerified !== currentUser.emailVerified) {
              try {
                await updateDoc(profileRef, { isVerified: !!currentUser.emailVerified });
              } catch (e) {
                console.warn("Failed to sync verification status:", e);
              }
            } else {
              setUserProfile(profile);
            }

            // Route based on profile completion/view
            if (view === 'login' || view === 'signup' || view === 'landing') {
              if (!profile.occupation) {
                setView('welcome');
              } else {
                setView('home');
              }
            }
          } else {
            // New user - automatically set up standard profile
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || '',
              photoURL: currentUser.photoURL || '',
              occupation: '',
              isPremium: false,
              aiReviewCount: 0,
              completionPercentage: 20,
              matchesFound: 0,
              isVerified: !!currentUser.emailVerified,
              createdAt: new Date().toISOString()
            };
            try {
              await setDoc(profileRef, newProfile);
              // snapshot listener will handle setting the state
              setView('welcome');
            } catch (error) {
              handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
            }
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        });
      } else {
        setUserProfile(null);
        if (view !== 'landing' && view !== 'sectors' && view !== 'success-stories' && view !== 'about' && view !== 'login' && view !== 'signup') {
          setView('landing');
        }
      }
    });

    return () => {
      unsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, [view]);

  // --- Effect: Stripe Success Check ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (sessionId && user) {
      const verifySubscription = async () => {
        try {
          const response = await fetch('/api/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, userId: user.uid }),
          });
          
          const data = await response.json();
          if (data.success) {
            toast.success("Welcome to GrantPrix Pro! Your subscription is now active.");
            // The onSnapshot listener will automatically update userProfile
          } else {
            throw new Error(data.error || "Verification failed");
          }
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          console.error("Error updating subscription status:", error);
        }
      };
      verifySubscription();
    }
  }, [user]);

  // --- Effect: Firestore Conferences Listener ---
  useEffect(() => {
    const q = collection(db, 'conferences');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conference));
      setDbConferences(fetched);
      setIsDbLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'conferences');
      toast.error("Failed to load grants. Please check your connection.");
      setIsDbLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Effect: Approved Opportunity Submissions Listener ---
  useEffect(() => {
    const q = query(
      collection(db, 'opportunity_submissions'), 
      where('status', '==', 'approved')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort client-side to avoid index issues
      const sorted = fetched.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setApprovedSubmissions(sorted);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'opportunity_submissions');
      toast.error("Failed to load community submissions.");
    });
    return () => unsubscribe();
  }, []);

  // --- Effect: Cleanup Duplicates ---
  const hasCleanedUp = React.useRef(false);
  useEffect(() => {
    if (isDbLoading || dbConferences.length === 0 || hasCleanedUp.current) return;
    
    const cleanup = async () => {
      const nameMap = new Map<string, Conference[]>();
      dbConferences.forEach(conf => {
        const name = (conf.name || '').toLowerCase().trim();
        if (!nameMap.has(name)) nameMap.set(name, []);
        nameMap.get(name)!.push(conf);
      });

      let deletedCount = 0;
      for (const [name, list] of nameMap.entries()) {
        if (list.length > 1) {
          // Sort by createdAt descending (most recent first)
          const sorted = [...list].sort((a, b) => {
            const timeA = a.createdAt ? (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : (a.createdAt as any).toMillis?.() || 0) : 0;
            const timeB = b.createdAt ? (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : (b.createdAt as any).toMillis?.() || 0) : 0;
            return timeB - timeA;
          });

          // Keep the first one (most recent), delete the rest
          const toDelete = sorted.slice(1);
          for (const conf of toDelete) {
            try {
              await deleteDoc(doc(db, 'conferences', conf.id));
              deletedCount++;
            } catch (e) {
              console.error(`Error deleting duplicate ${conf.name}:`, e);
            }
          }
        }
      }
      
      if (deletedCount > 0) {
        toast.success(`Cleaned up ${deletedCount} duplicate grants from the database.`);
      }
      hasCleanedUp.current = true;
    };

    cleanup();
  }, [dbConferences, isDbLoading]);

  const [isTracking, setIsTracking] = useState(false);

  // --- Effect: Automatic Application Tracking ---
  useEffect(() => {
    if (!user || !userProfile || !userProfile.applications || userProfile.applications.length === 0 || isTracking) return;

    const checkApplications = async () => {
      setIsTracking(true);
      const now = new Date();
      const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      
      // Only check apps that haven't been checked in the last 12 hours
      const appsToUpdate = userProfile.applications.filter(app => {
        const lastUpdate = new Date(app.updatedAt);
        return lastUpdate < twelveHoursAgo;
      }).slice(0, 3); // Limit to 3 checks per session to avoid rate limits

      if (appsToUpdate.length === 0) {
        setIsTracking(false);
        return;
      }

      let hasChanges = false;
      const updatedApplications = [...userProfile.applications];

      for (const app of appsToUpdate) {
        const conference = dbConferences.find(c => c.id === app.conferenceId);
        if (!conference) continue;

        try {
          const liveStatus = await verifyGrantStatus(conference.name, conference.applicationUrl);
          if (liveStatus) {
            const appIndex = updatedApplications.findIndex(a => a.conferenceId === app.conferenceId);
            if (appIndex >= 0) {
              // If status changed from Open to Closed and user was In Progress
              if (!liveStatus.isOpen && app.status === ApplicationStatus.IN_PROGRESS) {
                const notification: Omit<AppNotification, 'id'> = {
                  userId: user.uid,
                  title: 'Application Window Closed',
                  message: `The application window for "${conference.name}" has closed. Your application was marked as "In Progress".`,
                  type: 'status_change',
                  isRead: false,
                  createdAt: new Date().toISOString()
                };
                await addDoc(collection(db, 'notifications'), notification);
              }
              
              updatedApplications[appIndex] = {
                ...app,
                updatedAt: new Date().toISOString()
              };
              hasChanges = true;
            }
          }
        } catch (error) {
          console.error("Tracking error:", error);
        }
      }

      if (hasChanges) {
        try {
          await updateDoc(doc(db, 'users', user.uid), { applications: updatedApplications });
          setUserProfile({ ...userProfile, applications: updatedApplications });
        } catch (error) {
          console.error("Error updating tracked applications:", error);
        }
      }
      setIsTracking(false);
    };

    const timer = setTimeout(checkApplications, 5000); // Wait 5s after load
    return () => clearTimeout(timer);
  }, [user?.uid, userProfile?.applications?.length, dbConferences.length]);

  // --- Effect: Notifications Listener ---
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppNotification));
      setNotifications(fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
      toast.error("Failed to sync notifications.");
    });
    return () => unsubscribe();
  }, [user]);

  // --- Effect: Reviews Listener ---
  useEffect(() => {
    const q = query(
      collection(db, 'reviews'), 
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
      setReviews(fetched);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reviews');
      toast.error("Failed to sync reviews.");
    });
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  const filteredConferences = useMemo(() => {
    return allConferences?.filter(conf => {
      const matchesSearch = (conf.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
                           conf.tags?.some(tag => (tag || '').toLowerCase().includes((searchTerm || '').toLowerCase())) ||
                           (conf.field || '').toLowerCase().includes((searchTerm || '').toLowerCase());
      const matchesRegion = selectedRegion === 'All' || conf.region === selectedRegion;
      const matchesLocationType = selectedLocationType === 'All' || conf.locationType === selectedLocationType;
      const matchesFundingType = selectedFundingType === 'All' || conf.fundingType === selectedFundingType;
      const matchesField = selectedField === 'All' || conf.field === selectedField;
      
      let matchesDeadline = true;
      if (selectedDeadline === 'Urgent') {
        matchesDeadline = isDeadlineSoon(conf.grantDeadline);
      } else if (selectedDeadline === 'Upcoming') {
        const deadlineDate = new Date(conf.grantDeadline);
        const now = new Date();
        const diffTime = deadlineDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        matchesDeadline = diffDays > 30;
      }

      const isVisible = !conf.isHidden || userProfile?.isPremium;
      return matchesSearch && matchesRegion && matchesLocationType && matchesFundingType && matchesField && matchesDeadline && isVisible;
    });
  }, [searchTerm, selectedRegion, selectedLocationType, selectedFundingType, selectedField, selectedDeadline, allConferences, userProfile]);

  const uniqueFields = useMemo(() => {
    const fields = new Set(allConferences?.map(c => c.field));
    return ['All', ...Array.from(fields)];
  }, [allConferences]);

  // --- Handlers: Authentication ---
  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success('Successfully logged in with Google!');
    } catch (error) {
      console.error("Login Error:", error);
      toast.error('Failed to login with Google.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Successfully logged out!');
      setView('landing');
      setUserProfile(null);
      setIsSettingsOpen(false);
    } catch (error) {
      console.error("Logout Error:", error);
      toast.error('Failed to logout.');
    }
  };

  const handleEmailAuth = async (email: string, pass: string, isLogin: boolean) => {
    try {
      if (isLogin) {
        // 1. Pre-check if email exists in our registered_emails collection
        // We don't return early here to avoid blocking old users who aren't in the collection yet
        let isLikelyNotRegistered = false;
        try {
          const emailDoc = await getDoc(doc(db, 'registered_emails', email.toLowerCase().trim()));
          if (!emailDoc.exists()) {
            // Check fetchSignInMethodsForEmail as a fallback
            try {
              const methods = await fetchSignInMethodsForEmail(auth, email);
              if (methods.length === 0) {
                isLikelyNotRegistered = true;
              }
            } catch (authErr: any) {
              // If both fail, we can't be sure, so we assume it might not be registered
              isLikelyNotRegistered = true;
            }
          }
        } catch (e: any) {
          console.warn("registered_emails check failed:", e);
        }
        
        try {
          await signInWithEmailAndPassword(auth, email, pass);
          
          // Ensure registered_emails doc exists for existing users on successful login
          try {
            await setDoc(doc(db, 'registered_emails', email.toLowerCase().trim()), { registered: true });
          } catch (e) {
            console.warn("Failed to update registered_emails on login:", e);
          }
          
          toast.success('Successfully logged in!');
        } catch (error: any) {
          const errorCode = error?.code || '';
          const errorMessage = error?.message || '';
          const errorStr = String(error);
          
          const isInvalidCredential = 
            errorCode === 'auth/invalid-credential' || 
            errorCode === 'auth/user-not-found' ||
            errorMessage.includes('auth/invalid-credential') ||
            errorMessage.includes('auth/user-not-found') ||
            errorStr.includes('auth/invalid-credential') ||
            errorStr.includes('auth/user-not-found');

          if (errorCode === 'auth/operation-not-allowed') {
            console.error("Auth Configuration Error:", error);
            toast.error("Email/Password authentication is not enabled in the Firebase console.");
          } else if (isInvalidCredential) {
            console.warn("Auth Failure (User not found or invalid credentials):", error);
            if (isLikelyNotRegistered) {
              toast.error("This email is not registered yet. Please create an account to login.");
            } else {
              toast.error("Incorrect password. Please try again.");
            }
          } else if (errorCode === 'auth/wrong-password' || errorMessage.includes('auth/wrong-password')) {
            console.warn("Auth Failure (Wrong password):", error);
            toast.error("Incorrect password. Please try again.");
          } else if (errorCode === 'auth/email-already-in-use' || errorMessage.includes('auth/email-already-in-use')) {
            console.warn("Auth Failure (Email already in use):", error);
            toast.error("This email is already registered. Please log in instead.");
          } else if (errorCode === 'auth/invalid-email' || errorMessage.includes('auth/invalid-email')) {
            console.warn("Auth Failure (Invalid email):", error);
            toast.error("Please enter a valid email address.");
          } else if (errorCode === 'auth/weak-password' || errorMessage.includes('auth/weak-password')) {
            console.warn("Auth Failure (Weak password):", error);
            toast.error("Password should be at least 6 characters.");
          } else {
            console.error("Auth Error:", error);
            toast.error(errorMessage || "An unexpected authentication error occurred.");
          }
        }
      } else {
        await createUserWithEmailAndPassword(auth, email, pass);
        
        // Create registered_emails doc on signup
        try {
          await setDoc(doc(db, 'registered_emails', email.toLowerCase().trim()), { registered: true });
        } catch (e) {
          console.warn("Failed to create registered_emails on signup:", e);
        }
        
        toast.success('Account created successfully!');
      }
    } catch (error: any) {
      // This catch block handles errors from createUserWithEmailAndPassword or other unexpected errors
      const errorCode = error?.code || '';
      const errorMessage = error?.message || '';
      
      if (errorCode === 'auth/email-already-in-use') {
        toast.error("This email is already registered. Please log in instead.");
      } else {
        console.error("Auth Error:", error);
        toast.error(errorMessage || "An unexpected authentication error occurred.");
      }
    }
  };

  // --- Handlers: AI Assistant & Search ---
  const handleOpenAI = (conf: Conference) => {
    setSelectedConfForAI(conf);
    setAiAdvice('');
    setAiScore(null);
    
    // Pre-fill background if empty
    if (!userBackground && userProfile) {
      const background = `
        Primary Goal: ${userProfile.primaryGoal || 'Not specified'}
        Experience: ${userProfile.experienceYears || 0} years
        Interests: ${userProfile.interests?.join(', ') || 'None'}
        Impact Areas: ${userProfile.impactAreas?.join(', ') || 'None'}
        Location: ${userProfile.location || 'Not specified'}
      `.trim();
      setUserBackground(background);
    }
  };

  const handleGetAdvice = async () => {
    if (!selectedConfForAI || !userBackground) return;
    
    if (!userProfile?.isPremium && (userProfile?.aiReviewCount || 0) >= 3) {
      toast.error("You've reached the limit of 3 AI reviews for Standard accounts. Upgrade to Pro for unlimited reviews!");
      return;
    }

    setIsAiLoading(true);
    try {
      const result = await getGrantAdvice(selectedConfForAI, userBackground);
      setAiAdvice(result.advice || '');
      setAiScore(result.score || 0);
      
      // Increment review count in Firestore (only for non-premium users)
      if (user && !userProfile?.isPremium) {
        const newCount = (userProfile?.aiReviewCount || 0) + 1;
        await setDoc(doc(db, 'users', user.uid), { aiReviewCount: newCount }, { merge: true });
        setUserProfile(prev => prev ? { ...prev, aiReviewCount: newCount } : null);
      }
    } catch (error) {
      console.error("AI Advice Error:", error);
      toast.error("Failed to get AI advice.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleUpgrade = async () => {
    if (!user) {
      toast.error("Please log in to upgrade.");
      return;
    }
    
    setIsUpgrading(true);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: user.uid, 
          userEmail: user.email 
        }),
      });
      
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to create checkout session");
      }
    } catch (error: any) {
      console.error("Upgrade Error:", error);
      toast.error(error.message || "Failed to initialize upgrade. Please try again.");
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleRealTimeSearch = async (query: string) => {
    setIsLoading(true);
    const searchQuery = query.trim() || 'tech conference grants for underrepresented groups 2026';
    const toastId = toast.loading(`AI Scout is searching for ${query.trim() ? `"${query}"` : 'general opportunities'}...`);
    
    try {
      const results = await searchConferences(searchQuery);
      if (results && results.length > 0) {
        let savedCount = 0;
        let duplicateCount = 0;
        
        for (const conf of results) {
          const isDuplicate = dbConferences?.some(existing => 
            existing.id === conf.id || 
            (existing.name || '').toLowerCase() === (conf.name || '').toLowerCase()
          );

          if (isDuplicate) {
            duplicateCount++;
            continue;
          }

          try {
            const cleanedConf = { ...conf };
            Object.keys(cleanedConf).forEach(key => {
              if ((cleanedConf as any)[key] === undefined) delete (cleanedConf as any)[key];
            });
            await setDoc(doc(db, 'conferences', conf.id), {
              ...cleanedConf,
              isVerified: true,
              createdAt: serverTimestamp()
            });
            savedCount++;
          } catch (e) {
            console.error("Error saving conference:", e);
          }
        }
        
        if (savedCount > 0) {
          toast.success(`AI Scout found and added ${savedCount} new opportunities!`, { id: toastId });
        } else if (duplicateCount > 0) {
          toast.info(`AI Scout found ${duplicateCount} opportunities, but they are already in your database.`, { id: toastId });
        } else {
          toast.error("AI Scout couldn't find any new matching opportunities right now.", { id: toastId });
        }
      } else {
        toast.error("AI Scout couldn't find any new matching opportunities right now.", { id: toastId });
      }
    } catch (error) {
      console.error("Real-time search error:", error);
      toast.error("Something went wrong during the search. Please try again.", { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Handlers: User Profile & Actions ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        if (userProfile && user) {
          const updatedProfile = { ...userProfile, photoURL: compressed };
          setUserProfile(updatedProfile);
          
          // Clean undefined values
          const cleanedProfile = { ...updatedProfile };
          Object.keys(cleanedProfile).forEach(key => {
            if ((cleanedProfile as any)[key] === undefined) delete (cleanedProfile as any)[key];
          });
          
          await setDoc(doc(db, 'users', user.uid), cleanedProfile, { merge: true });
          toast.success('Profile picture updated!');
        }
      } catch (err) {
        console.error("Image upload error:", err);
        toast.error("Failed to process image. Please try a smaller file.");
      }
    }
  };

  const handleSaveConference = async (confId: string) => {
    if (!user || !userProfile) {
      setView('login');
      toast.error('Please login to save conferences.');
      return;
    }

    const saved = userProfile.savedConferences || [];
    const isSaved = saved.includes(confId);
    const newSaved = isSaved ? saved.filter(id => id !== confId) : [...saved, confId];
    
    // Also update applications to start tracking if not already present
    let newApplications = userProfile.applications || [];
    if (!isSaved && !newApplications.some(app => app.conferenceId === confId)) {
      newApplications = [...newApplications, {
        conferenceId: confId,
        status: ApplicationStatus.BOOKMARKED,
        updatedAt: new Date().toISOString()
      }];
    }

    try {
      await setDoc(doc(db, 'users', user.uid), { 
        savedConferences: newSaved,
        applications: newApplications 
      }, { merge: true });
      setUserProfile({ ...userProfile, savedConferences: newSaved, applications: newApplications });
      toast.success(isSaved ? 'Conference removed from saved.' : 'Conference saved successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const handleUpdateApplication = async (confId: string, status: ApplicationStatus, notes?: string) => {
    if (!user || !userProfile) return;
    
    const applications = userProfile.applications || [];
    const existingIndex = applications.findIndex(app => app.conferenceId === confId);
    
    const newApp: UserApplication = {
      conferenceId: confId,
      status,
      updatedAt: new Date().toISOString(),
      notes: notes || (existingIndex >= 0 ? (applications[existingIndex].notes || '') : '')
    };
    
    let newApplications;
    if (existingIndex >= 0) {
      newApplications = [...applications];
      newApplications[existingIndex] = newApp;
    } else {
      newApplications = [...applications, newApp];
    }
    
    try {
      await setDoc(doc(db, 'users', user.uid), { applications: newApplications }, { merge: true });
      setUserProfile({ ...userProfile, applications: newApplications });
      toast.success(`Application status updated to ${status}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const handleAddReview = async (conferenceId: string, rating: number, comment: string) => {
    if (!user || !userProfile) return;
    
    const newReview: Omit<Review, 'id'> = {
      conferenceId,
      userId: user.uid,
      userName: userProfile.displayName || 'Anonymous Agent',
      rating,
      comment,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    try {
      await addDoc(collection(db, 'reviews'), newReview);
      
      // Notify Admin (Simulation)
      // In a real app, we'd use a cloud function or a specific admin UID
      // For now, we'll just show a success message to the user
      toast.success('Review submitted! It will be visible once approved by the moderator.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reviews');
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setView('login');
      return;
    }
    try {
      const q = query(
        collection(db, 'subscriptions'), 
        where('uid', '==', user.uid),
        where('email', '==', email)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        toast.info('You are already subscribed with this email.');
        setShowSubscription(false);
        return;
      }

      await addDoc(collection(db, 'subscriptions'), {
        email,
        uid: user.uid,
        regions: selectedRegion === 'All' ? Object.values(Region) : [selectedRegion],
        createdAt: serverTimestamp()
      });
      toast.success('Subscribed successfully!');
      setShowSubscription(false);
    } catch (error) {
      console.error("Subscription Error:", error);
      toast.error('Failed to subscribe.');
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        isRead: true
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
    }
  };

  // --- Render Helpers: View Components ---
  const renderView = () => {
    // Public Landing Page
    if (view === 'landing') {
      return (
        <LandingView 
          onGetStarted={() => setView('signup')} 
          onLogin={() => setView('login')}
          onViewSectors={() => setView('sectors')}
          onViewSuccessStories={() => setView('success-stories')}
          onViewAbout={() => setView('about')}
          approvedSubmissions={approvedSubmissions}
        />
      );
    }

    // About Page (Mission)
    if (view === 'about') {
      return (
        <AboutView 
          onBack={() => setView(user ? 'home' : 'landing')} 
          onGetStarted={() => setView('signup')} 
        />
      );
    }

    // Share Opportunity
    if (view === 'share-opportunity' && user) {
      return (
        <ShareOpportunityView 
          onBack={() => setView('home')}
          user={user}
        />
      );
    }

    // Admin Dashboard
    if (view === 'admin' && user && user.email === 'mariagloriaobonoondodev@gmail.com') {
      return (
        <AdminDashboardView 
          onBack={() => setView('home')}
        />
      );
    }

    // Sectors/Industries Information
    if (view === 'sectors') {
      return (
        <SectorsView 
          onBack={() => setView('landing')} 
          onGetStarted={() => setView('signup')} 
        />
      );
    }

    // Success Stories & Community Reviews
    if (view === 'success-stories') {
      return (
        <SuccessStoriesView 
          onBack={() => setView('landing')} 
          onGetStarted={() => setView('signup')} 
          conferences={allConferences}
          onAddReview={handleAddReview}
          isLoggedIn={!!user}
        />
      );
    }

    // Authentication (Login/Signup)
    if (view === 'login' || view === 'signup') {
      return <AuthView view={view} onSwitch={setView} />;
    }

    // Onboarding/Welcome Flow
    if (view === 'welcome' && user) {
      return (
        <WelcomeView 
          user={user} 
          initialProfile={userProfile} 
          onComplete={async (profile) => {
            try {
              await setDoc(doc(db, 'users', user.uid), profile);
              setUserProfile(profile);
              setView('home');
              toast.success("Profile initialized successfully!");
            } catch (error) {
              console.error("Profile initialization error:", error);
              handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
              toast.error("Permission denied or network error. Please check your connection.");
            }
          }} 
        />
      );
    }

    // User Profile Management
    if (view === 'profile' && user) {
      return (
        <ProfileView 
          user={user} 
          initialProfile={userProfile}
          onSave={async (profile) => {
            try {
              await setDoc(doc(db, 'users', user.uid), profile);
              setUserProfile(profile);
              setView('home');
            } catch (error) {
              handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
            }
          }}
          onBack={() => setView('home')}
          onUpgrade={handleUpgrade}
          isUpgrading={isUpgrading}
          onFileUpload={handleFileUpload}
          onSettings={() => setIsSettingsOpen(true)}
        />
      );
    }

    // Email Verification Notice
    if (view === 'verify-email' && user) {
      return (
        <VerifyEmailView 
          user={user} 
          onVerified={() => setView('welcome')} 
          onLogout={handleLogout}
        />
      );
    }

    // Detailed Grant/Conference Information
    if (view === 'grant-details' && selectedGrant) {
      return (
        <GrantDetailsView 
          grant={selectedGrant} 
          onBack={() => {
            setView(user ? 'home' : 'landing');
          }}
          onOpenAI={handleOpenAI}
          isPremium={!!userProfile?.isPremium}
          onUpdateApplication={handleUpdateApplication}
          userApplication={userProfile?.applications?.find(app => app.conferenceId === selectedGrant.id)}
          userProfile={userProfile}
        />
      );
    }

    // Main Authenticated Dashboard
    if (view === 'home' && user && userProfile) {
      return (
        <DashboardView 
          profile={userProfile}
          conferences={allConferences}
          onViewDetails={(conf) => {
            setScrollPosition(window.scrollY);
            setSelectedGrant(conf);
            setView('grant-details');
          }}
          onOpenAI={handleOpenAI}
          onProfile={() => {
            setScrollPosition(window.scrollY);
            setView('profile');
          }}
          onSettings={() => setIsSettingsOpen(true)}
          onLogout={async () => {
            await handleLogout();
          }}
          onSaveConference={handleSaveConference}
          onRealTimeSearch={handleRealTimeSearch}
          isLoading={isLoading}
          onShareOpportunity={() => {
            setScrollPosition(window.scrollY);
            setView('share-opportunity');
          }}
          onAdmin={() => {
            setScrollPosition(window.scrollY);
            setView('admin');
          }}
          isAdmin={user.email === 'mariagloriaobonoondodev@gmail.com'}
          approvedSubmissions={approvedSubmissions}
          notifications={notifications}
          onMarkAsRead={handleMarkAsRead}
          // Filter Props
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          selectedRegion={selectedRegion}
          setSelectedRegion={setSelectedRegion}
          selectedLocationType={selectedLocationType}
          setSelectedLocationType={setSelectedLocationType}
          selectedFundingType={selectedFundingType}
          setSelectedFundingType={setSelectedFundingType}
          selectedDeadline={selectedDeadline}
          setSelectedDeadline={setSelectedDeadline}
          selectedField={selectedField}
          setSelectedField={setSelectedField}
          selectedCoverage={selectedCoverage}
          setSelectedCoverage={setSelectedCoverage}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          visibleCount={visibleCountDashboard}
          setVisibleCount={setVisibleCountDashboard}
        />
      );
    }

    return null;
  };

  if (!isAuthReady) {
    return <LoadingView />;
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-space-bg text-white font-sans selection:bg-lime-accent selection:text-space-bg">
        <Toaster position="top-center" theme="dark" richColors />
        {renderView() || <NotFoundView onHome={() => setView(user ? 'home' : 'landing')} />}

        {/* Subscription Modal */}
      <AnimatePresence>
        {showSubscription && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] p-12 max-w-lg w-full relative"
            >
              <button 
                onClick={() => setShowSubscription(false)}
                className="absolute top-8 right-8 text-[#1A1A1A]/30 hover:text-[#1A1A1A] transition-colors"
              >
                <X size={24} />
              </button>
              <div className="mb-8">
                <div className="w-16 h-16 bg-[#FF6321]/10 text-[#FF6321] rounded-2xl flex items-center justify-center mb-6">
                  <Bell size={32} />
                </div>
                <h2 className="text-3xl font-bold tracking-tighter mb-4">Set Up Alerts</h2>
                <p className="text-[#1A1A1A]/60 font-light">
                  Choose your regions and we'll notify you as soon as new funding opportunities open up.
                </p>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold mb-3 block opacity-40">Email Address</label>
                  <input 
                    type="email" 
                    placeholder="hello@example.com"
                    className="w-full border-b-2 border-[#1A1A1A]/10 py-2 focus:outline-none focus:border-[#FF6321] transition-colors text-lg"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold mb-3 block opacity-40">Interested Regions</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.values(Region).map(r => (
                      <button 
                        key={r}
                        className="px-4 py-2 rounded-full border border-[#1A1A1A]/10 text-xs font-bold hover:border-[#FF6321] hover:text-[#FF6321] transition-all"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <button 
                  onClick={handleSubscribe}
                  className="w-full bg-[#FF6321] text-white py-4 rounded-2xl font-bold text-lg hover:shadow-xl hover:shadow-[#FF6321]/20 transition-all active:scale-95"
                >
                  Save Preferences
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Conference Details & AI Modal */}
      <AnimatePresence>
        {selectedConfForAI && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 md:p-6 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-space-card border border-space-border rounded-[32px] max-w-4xl w-full relative overflow-hidden flex flex-col md:flex-row h-full max-h-[90vh]"
            >
              <button 
                onClick={() => { setSelectedConfForAI(null); setAiAdvice(''); setUserBackground(''); }}
                className="absolute top-6 right-6 z-10 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white/60 hover:text-white transition-all"
              >
                <X size={20} />
              </button>

              {/* Left Side: Info & Reviews */}
              <div className="flex-1 p-8 overflow-y-auto border-r border-space-border custom-scrollbar">
                <div className="relative h-48 rounded-2xl overflow-hidden mb-8 bg-gradient-to-br from-space-card via-space-border to-lime-accent/10 flex items-center justify-center">
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-from)_0%,_transparent_70%)]"></div>
                  <div className="text-6xl font-black text-white/5 select-none">{selectedConfForAI.name.charAt(0)}</div>
                  {selectedConfForAI.imageUrl && (
                    <img 
                      src={selectedConfForAI.imageUrl} 
                      alt={selectedConfForAI.name} 
                      className="absolute inset-0 w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-space-card to-transparent"></div>
                  <div className="absolute bottom-6 left-6">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-lime-accent mb-2">{selectedConfForAI.field}</div>
                    <h2 className="text-3xl font-bold tracking-tighter">{selectedConfForAI.name}</h2>
                  </div>
                </div>

                <div className="space-y-8">
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-4">Overview</h3>
                    <p className="text-sm text-white/60 leading-relaxed">{selectedConfForAI.description}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">Location</div>
                      <div className="text-xs font-bold flex items-center gap-2">
                        <MapPin size={12} className="text-lime-accent" /> {selectedConfForAI.location}
                      </div>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">Deadline</div>
                      <div className="text-xs font-bold flex items-center gap-2">
                        <Clock size={12} className="text-lime-accent" /> {new Date(selectedConfForAI.grantDeadline).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-4">Coverage</h3>
                    <div className="flex flex-wrap gap-3">
                      {selectedConfForAI.grantCoverage?.flight && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-lime-accent/10 border border-lime-accent/20 rounded-xl text-[10px] font-bold uppercase tracking-widest text-lime-accent">
                          <Plane size={12} /> Flight
                        </div>
                      )}
                      {selectedConfForAI.grantCoverage?.hotel && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-lime-accent/10 border border-lime-accent/20 rounded-xl text-[10px] font-bold uppercase tracking-widest text-lime-accent">
                          <Hotel size={12} /> Hotel
                        </div>
                      )}
                      {selectedConfForAI.grantCoverage?.ticket && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-lime-accent/10 border border-lime-accent/20 rounded-xl text-[10px] font-bold uppercase tracking-widest text-lime-accent">
                          <Ticket size={12} /> Ticket
                        </div>
                      )}
                      {selectedConfForAI.grantCoverage?.stipend && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-lime-accent/10 border border-lime-accent/20 rounded-xl text-[10px] font-bold uppercase tracking-widest text-lime-accent">
                          <Zap size={12} /> Stipend
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Community Reviews */}
                  <div>
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Community Reviews</h3>
                    </div>

                    <div className="space-y-4">
                      {reviews.filter(r => r.conferenceId === selectedConfForAI.id).length > 0 ? (
                        reviews.filter(r => r.conferenceId === selectedConfForAI.id).map((rev) => (
                          <div key={rev.id} className="p-4 bg-white/5 rounded-2xl border border-white/5">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-widest">{rev.userName}</span>
                              <div className="flex gap-0.5">
                                {[...Array(5)].map((_, j) => (
                                  <Award key={j} size={10} className={j < rev.rating ? 'text-lime-accent' : 'text-white/10'} />
                                ))}
                              </div>
                            </div>
                            <p className="text-[10px] text-white/50 leading-relaxed italic">"{rev.comment}"</p>
                            <div className="text-[8px] font-bold uppercase tracking-widest opacity-20 mt-2 text-right">
                              {new Date(rev.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 bg-white/5 rounded-2xl border border-dashed border-white/10">
                          <p className="text-[8px] font-bold uppercase tracking-widest opacity-40">No reviews yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side: AI Assistant */}
              <div className="w-full md:w-[400px] bg-space-card p-8 flex flex-col">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-lime-accent/10 rounded-xl flex items-center justify-center text-lime-accent">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest">AI Grant Assistant</h3>
                    <p className="text-[8px] font-bold uppercase tracking-widest opacity-40">Neural Analysis Engine</p>
                  </div>
                </div>

                {isAiLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                    <div className="relative">
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                        className="w-32 h-32 border-2 border-dashed border-lime-accent/20 rounded-full"
                      />
                      <motion.div 
                        animate={{ rotate: -360 }}
                        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-2 border-2 border-dashed border-lime-accent/40 rounded-full"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="text-lime-accent"
                        >
                          <BrainCircuit size={40} />
                        </motion.div>
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-lime-accent animate-pulse">Neural Processing</h4>
                      <p className="text-[8px] font-bold uppercase tracking-widest opacity-40">Analyzing Resume Vectors • Matching Grant Criteria</p>
                    </div>
                    
                    <div className="w-full max-w-[200px] h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        className="w-1/2 h-full bg-lime-accent shadow-[0_0_10px_rgba(193,255,114,0.5)]"
                      />
                    </div>
                  </div>
                ) : !aiAdvice ? (
                  <div className="flex-1 flex flex-col">
                    <div className="mb-6">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3 block">Application Context</label>
                      <textarea 
                        placeholder="Paste your resume summary or background here for a precision match analysis..."
                        className="w-full bg-space-bg border border-space-border rounded-2xl p-4 focus:border-lime-accent outline-none transition-all text-xs min-h-[200px] resize-none"
                        
                      />
                    </div>
                    <button 
                      onClick={handleGetAdvice}
                      disabled={isAiLoading || !userBackground}
                      className="w-full bg-lime-accent text-space-bg py-4 rounded-2xl font-bold text-xs uppercase tracking-widest hover:scale-[1.02] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                    >
                      <Zap size={16} />
                      Run Neural Match
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                      <div className="p-4 bg-lime-accent/5 border border-lime-accent/20 rounded-2xl">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-lime-accent mb-2">Neural Match Score</div>
                        <div className="flex items-end gap-2">
                          <div className="text-4xl font-bold text-lime-accent">{aiScore}%</div>
                          <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">
                            {aiScore && aiScore >= 80 ? 'High Probability' : aiScore && aiScore >= 50 ? 'Medium Probability' : 'Low Probability'}
                          </div>
                        </div>
                      </div>
                      <div className="prose prose-invert prose-xs">
                        <div className="text-white/70 leading-relaxed text-[11px] markdown-body">
                          <ReactMarkdown>{aiAdvice}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setAiAdvice('')}
                      className="w-full mt-6 py-3 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-all"
                    >
                      Reset Analysis
                    </button>
                  </div>
                )}

                <div className="mt-8 pt-8 border-t border-white/5">
                  {getGrantStatus(selectedConfForAI) === 'open' && (
                    <a 
                      href={selectedConfForAI.applicationUrl || '#'} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all ${selectedConfForAI.applicationUrl ? 'bg-white text-space-bg hover:bg-lime-accent' : 'bg-white/5 text-white/20 cursor-not-allowed'}`}
                    >
                      {selectedConfForAI.applicationUrl ? 'Official Website' : 'Coming Soon'}
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <SettingsModal 
            onClose={() => setIsSettingsOpen(false)}
            onLogout={handleLogout}
            user={user}
          />
        )}
      </AnimatePresence>
    </div>
    </ErrorBoundary>
  );
}

function SettingsModal({ onClose, onLogout, user }: { onClose: () => void, onLogout: () => void, user: FirebaseUser | null }) {
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleResetPassword = async () => {
    if (!user?.email) return;
    setIsProcessing(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setStatus({ type: 'success', message: 'Password reset email sent. Please check your inbox.' });
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message || 'Failed to send reset email.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    setIsProcessing(true);
    const userPath = `users/${user.uid}`;
    try {
      // Delete from Firestore first
      try {
        await deleteDoc(doc(db, 'users', user.uid));
      } catch (fsError) {
        handleFirestoreError(fsError, OperationType.DELETE, userPath);
      }
      
      // Delete from Auth
      await deleteUser(user);
      onClose();
      onLogout();
    } catch (error: any) {
      console.error('Delete account error:', error);
      
      // Check if it's a re-authentication error (Firebase Auth)
      const isReauthError = error.code === 'auth/requires-recent-login';
      
      setStatus({ 
        type: 'error', 
        message: isReauthError 
          ? 'For security reasons, you must sign out and sign in again before deleting your account.'
          : 'Failed to delete account. Please try again or contact support.'
      });
      setShowDeleteConfirm(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const settingsOptions = [
    { id: 'notifications', name: 'Notifications', icon: <Bell size={18} />, description: 'Manage alert preferences', action: () => window.open('/settings/notifications', '_blank') },
    { id: 'payments', name: 'Manage Payments', icon: <CreditCard size={18} />, description: 'Billing and subscriptions', action: () => setStatus({ type: 'success', message: 'Billing portal is being initialized...' }) },
    { id: 'password', name: 'Reset Password', icon: <Key size={18} />, description: 'Update security credentials', action: handleResetPassword },
    { id: 'privacy', name: 'Privacy Policy', icon: <Shield size={18} />, description: 'Data handling and terms', action: () => window.open('https://grantprix.io/privacy', '_blank') },
    { id: 'delete', name: 'Delete Account', icon: <Trash2 size={18} />, description: 'Permanently remove your data', danger: true, action: () => setShowDeleteConfirm(true) },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-space-card border border-space-border rounded-[32px] max-w-2xl w-full overflow-hidden"
      >
        <div className="p-8 border-b border-white/5 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tighter uppercase">Account Settings</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mt-1">System Configuration • {user?.email}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-all">
            <X size={20} />
          </button>
        </div>

        {status && (
          <div className={`mx-8 mt-6 p-4 rounded-xl border ${status.type === 'success' ? 'bg-lime-accent/10 border-lime-accent/20 text-lime-accent' : 'bg-red-500/10 border-red-500/20 text-red-500'} text-[10px] font-bold uppercase tracking-widest flex justify-between items-center`}>
            {status.message}
            <button onClick={() => setStatus(null)}><X size={14} /></button>
          </div>
        )}

        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {!showDeleteConfirm ? (
            settingsOptions.map((opt) => (
              <button 
                key={opt.id}
                onClick={opt.action}
                disabled={isProcessing}
                className={`flex items-start gap-4 p-4 rounded-2xl border transition-all text-left ${opt.danger ? 'bg-red-500/5 border-red-500/10 hover:bg-red-500/10 hover:border-red-500/20' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'} disabled:opacity-50`}
              >
                <div className={`p-2 rounded-xl ${opt.danger ? 'bg-red-500/10 text-red-500' : 'bg-lime-accent/10 text-lime-accent'}`}>
                  {opt.icon}
                </div>
                <div>
                  <div className={`text-xs font-bold uppercase tracking-widest ${opt.danger ? 'text-red-500' : ''}`}>{opt.name}</div>
                  <div className="text-[8px] font-bold uppercase tracking-widest opacity-40 mt-1">{opt.description}</div>
                </div>
              </button>
            ))
          ) : (
            <div className="col-span-full py-8 text-center space-y-6">
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500">
                <Trash2 size={40} />
              </div>
              <div>
                <h3 className="text-xl font-bold tracking-tighter uppercase text-red-500">Delete Account?</h3>
                <p className="text-xs text-white/40 mt-2 max-w-sm mx-auto leading-relaxed">
                  This action is permanent and cannot be undone. All your saved grants, profile data, and AI analysis history will be wiped from our servers.
                </p>
              </div>
              <div className="flex flex-col gap-3 max-w-xs mx-auto">
                <button 
                  onClick={handleDeleteAccount}
                  disabled={isProcessing}
                  className="w-full py-4 bg-red-500 text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-red-600 transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 className="animate-spin" /> : 'Confirm Permanent Deletion'}
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isProcessing}
                  className="w-full py-4 bg-white/5 text-white/40 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ShareOpportunityView({ onBack, user }: { onBack: () => void, user: any }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [region, setRegion] = useState<Region>(Region.GLOBAL);
  const [locationType, setLocationType] = useState<LocationType>(LocationType.GLOBAL);
  const [fundingType, setFundingType] = useState<FundingType>(FundingType.FULL);
  const [field, setField] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [grantDeadline, setGrantDeadline] = useState('');
  const [flight, setFlight] = useState(false);
  const [hotel, setHotel] = useState(false);
  const [ticket, setTicket] = useState(false);
  const [stipend, setStipend] = useState(false);
  const [tags, setTags] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAutofilling, setIsAutofilling] = useState(false);

  const handleAIAutofill = async () => {
    if (!name && !url) {
      toast.error('Please provide at least a name or a website URL.');
      return;
    }
    setIsAutofilling(true);
    try {
      const data = await autofillOpportunity(name, url);
      if (data) {
        setName(data.name || name);
        setUrl(data.applicationUrl || url);
        setDescription(data.description || '');
        setLocation(data.location || '');
        setRegion(data.region || Region.GLOBAL);
        setLocationType(data.locationType || LocationType.GLOBAL);
        setFundingType(data.fundingType || FundingType.FULL);
        setField(data.field || '');
        setStartDate(data.startDate || '');
        setEndDate(data.endDate || '');
        setGrantDeadline(data.grantDeadline || '');
        setFlight(data.grantCoverage?.flight || false);
        setHotel(data.grantCoverage?.hotel || false);
        setTicket(data.grantCoverage?.ticket || false);
        setStipend(data.grantCoverage?.stipend || false);
        setTags(data.tags?.join(', ') || '');
        toast.success('Information autofilled by AI! Please review before submitting.');
      } else {
        toast.error('AI could not find enough information. Please fill in manually.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to autofill information.');
    } finally {
      setIsAutofilling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsLoading(true);

    try {
      const submission = {
        name,
        applicationUrl: url,
        description,
        location,
        region,
        locationType,
        fundingType,
        field,
        startDate,
        endDate,
        grantDeadline,
        grantCoverage: {
          flight,
          hotel,
          ticket,
          stipend
        },
        tags: tags.split(',').map(t => t.trim()).filter(t => t !== ''),
        submittedBy: user.uid,
        submitterName: user.displayName || 'Anonymous',
        submitterEmail: user.email || '',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'opportunity_submissions'), submission);
      
      toast.success('Opportunity shared! It will be reviewed by our team.');
      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'opportunity_submissions');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-space-bg text-white font-sans p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity mb-12">
          <ChevronRight size={14} className="rotate-180" /> Back to Dashboard
        </button>

        <div className="bento-card p-8 md:p-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-accent/10 border border-lime-accent/20 mb-6">
            <Share2 size={12} className="text-lime-accent" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-lime-accent">Community Contribution</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tighter uppercase mb-2">Share an Opportunity</h2>
          <p className="text-white/40 font-light mb-8">
            Discovered a conference or grant not listed here? Share it with the community. All submissions are reviewed before being published directly as new grants.
          </p>

          <div className="flex justify-end mb-6">
            <button
              type="button"
              onClick={handleAIAutofill}
              disabled={isAutofilling || (!name && !url)}
              className="flex items-center gap-2 px-4 py-2 bg-lime-accent/10 border border-lime-accent/20 rounded-xl text-[10px] font-bold uppercase tracking-widest text-lime-accent hover:bg-lime-accent/20 transition-all disabled:opacity-50"
            >
              {isAutofilling ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {isAutofilling ? 'Autofilling...' : 'Autofill with AI'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 block">Conference Name</label>
                <input 
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs outline-none focus:border-lime-accent transition-all"
                  placeholder="e.g. AI World Summit 2026"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 block">Website URL</label>
                <input 
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs outline-none focus:border-lime-accent transition-all"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 block">Description</label>
              <textarea 
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs outline-none focus:border-lime-accent transition-all resize-none"
                placeholder="Tell us about the opportunity..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 block">Location (City, Country)</label>
                <input 
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs outline-none focus:border-lime-accent transition-all"
                  placeholder="e.g. San Francisco, USA"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 block">Region</label>
                <select 
                  value={region}
                  onChange={(e) => setRegion(e.target.value as Region)}
                  className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs outline-none focus:border-lime-accent transition-all appearance-none"
                >
                  {Object.values(Region).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 block">Field / Industry</label>
                <input 
                  type="text"
                  required
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                  className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs outline-none focus:border-lime-accent transition-all"
                  placeholder="e.g. Artificial Intelligence"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 block">Location Type</label>
                <select 
                  value={locationType}
                  onChange={(e) => setLocationType(e.target.value as LocationType)}
                  className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs outline-none focus:border-lime-accent transition-all appearance-none"
                >
                  {Object.values(LocationType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 block">Funding Type</label>
                <select 
                  value={fundingType}
                  onChange={(e) => setFundingType(e.target.value as FundingType)}
                  className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs outline-none focus:border-lime-accent transition-all appearance-none"
                >
                  {Object.values(FundingType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 block">Tags (comma separated)</label>
                <input 
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs outline-none focus:border-lime-accent transition-all"
                  placeholder="e.g. AI, Tech, Diversity"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 block">Start Date</label>
                <input 
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs outline-none focus:border-lime-accent transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 block">End Date</label>
                <input 
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs outline-none focus:border-lime-accent transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 block">Grant Deadline</label>
                <input 
                  type="date"
                  required
                  value={grantDeadline}
                  onChange={(e) => setGrantDeadline(e.target.value)}
                  className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs outline-none focus:border-lime-accent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-4 block">Grant Coverage</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button 
                  type="button"
                  onClick={() => setFlight(!flight)}
                  className={`p-4 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${flight ? 'bg-lime-accent border-lime-accent text-space-bg' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'}`}
                >
                  <Plane size={14} /> Flight
                </button>
                <button 
                  type="button"
                  onClick={() => setHotel(!hotel)}
                  className={`p-4 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${hotel ? 'bg-lime-accent border-lime-accent text-space-bg' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'}`}
                >
                  <Hotel size={14} /> Hotel
                </button>
                <button 
                  type="button"
                  onClick={() => setTicket(!ticket)}
                  className={`p-4 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${ticket ? 'bg-lime-accent border-lime-accent text-space-bg' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'}`}
                >
                  <Ticket size={14} /> Ticket
                </button>
                <button 
                  type="button"
                  onClick={() => setStipend(!stipend)}
                  className={`p-4 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${stipend ? 'bg-lime-accent border-lime-accent text-space-bg' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'}`}
                >
                  <Zap size={14} /> Stipend
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full btn-lime py-6 flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              Submit for Review
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function AdminDashboardView({ onBack }: { onBack: () => void }) {
  const [pendingReviews, setPendingReviews] = useState<Review[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const reviewsQuery = query(collection(db, 'reviews'), where('status', '==', 'pending'));
    const submissionsQuery = query(collection(db, 'opportunity_submissions'), where('status', '==', 'pending'));

    const unsubReviews = onSnapshot(reviewsQuery, (snapshot) => {
      setPendingReviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Review[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reviews');
    });

    const unsubSubmissions = onSnapshot(submissionsQuery, (snapshot) => {
      setPendingSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'opportunity_submissions');
      setLoading(false);
    });

    return () => {
      unsubReviews();
      unsubSubmissions();
    };
  }, []);

  const handleApproveReview = async (id: string) => {
    try {
      await updateDoc(doc(db, 'reviews', id), { status: 'approved' });
      toast.success('Review approved');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'reviews');
    }
  };

  const handleDenyReview = async (id: string) => {
    try {
      await updateDoc(doc(db, 'reviews', id), { status: 'denied' });
      toast.success('Review denied');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'reviews');
    }
  };

  const handleApproveSubmission = async (id: string) => {
    try {
      await updateDoc(doc(db, 'opportunity_submissions', id), { status: 'approved' });
      toast.success('Opportunity approved');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'opportunity_submissions');
    }
  };

  const handleDenySubmission = async (id: string) => {
    try {
      await updateDoc(doc(db, 'opportunity_submissions', id), { status: 'denied' });
      toast.success('Opportunity denied');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'opportunity_submissions');
    }
  };

  return (
    <div className="min-h-screen bg-space-bg text-white font-sans p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-16">
          <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">
            <ChevronRight size={14} className="rotate-180" /> Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            <Shield className="text-red-500" size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Admin Control Center</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Pending Reviews */}
          <section>
            <h2 className="text-2xl font-bold tracking-tighter uppercase mb-8 flex items-center gap-3">
              Pending Reviews
              <span className="bg-white/10 text-[10px] px-2 py-1 rounded-full">{pendingReviews.length}</span>
            </h2>
            <div className="space-y-4">
              {pendingReviews.length === 0 ? (
                <div className="bento-card p-8 text-center opacity-40 italic text-xs">No pending reviews</div>
              ) : (
                pendingReviews.map(review => (
                  <div key={review.id} className="bento-card p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-bold text-sm">{review.userName}</h4>
                        <p className="text-[10px] opacity-40 uppercase tracking-widest">Conf ID: {review.conferenceId}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleApproveReview(review.id)} className="p-2 bg-lime-accent/10 text-lime-accent rounded-lg hover:bg-lime-accent hover:text-space-bg transition-all"><CheckCircle size={16} /></button>
                        <button onClick={() => handleDenyReview(review.id)} className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"><X size={16} /></button>
                      </div>
                    </div>
                    <p className="text-xs text-white/60 italic">"{review.comment}"</p>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Pending Submissions */}
          <section>
            <h2 className="text-2xl font-bold tracking-tighter uppercase mb-8 flex items-center gap-3">
              Pending Opportunities
              <span className="bg-white/10 text-[10px] px-2 py-1 rounded-full">{pendingSubmissions.length}</span>
            </h2>
            <div className="space-y-4">
              {pendingSubmissions.length === 0 ? (
                <div className="bento-card p-8 text-center opacity-40 italic text-xs">No pending submissions</div>
              ) : (
                pendingSubmissions.map(sub => (
                  <div key={sub.id} className="bento-card p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-bold text-sm">{sub.name}</h4>
                        <a href={sub.applicationUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-lime-accent hover:underline flex items-center gap-1">
                          {sub.applicationUrl} <ExternalLink size={10} />
                        </a>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleApproveSubmission(sub.id)} className="p-2 bg-lime-accent/10 text-lime-accent rounded-lg hover:bg-lime-accent hover:text-space-bg transition-all"><CheckCircle size={16} /></button>
                        <button onClick={() => handleDenySubmission(sub.id)} className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"><X size={16} /></button>
                      </div>
                    </div>
                    <p className="text-xs text-white/60 mb-4">{sub.description}</p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <div className="text-[8px] font-bold uppercase tracking-widest opacity-40 mb-1">Location</div>
                        <div className="text-[10px]">{sub.location} ({sub.region})</div>
                      </div>
                      <div>
                        <div className="text-[8px] font-bold uppercase tracking-widest opacity-40 mb-1">Field</div>
                        <div className="text-[10px]">{sub.field}</div>
                      </div>
                      <div>
                        <div className="text-[8px] font-bold uppercase tracking-widest opacity-40 mb-1">Dates</div>
                        <div className="text-[10px]">{sub.startDate} - {sub.endDate}</div>
                      </div>
                      <div>
                        <div className="text-[8px] font-bold uppercase tracking-widest opacity-40 mb-1">Deadline</div>
                        <div className="text-[10px] text-lime-accent">{sub.grantDeadline}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {sub.grantCoverage?.flight && <span className="text-[8px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 px-2 py-1 rounded flex items-center gap-1"><Plane size={10} /> Flight</span>}
                      {sub.grantCoverage?.hotel && <span className="text-[8px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 px-2 py-1 rounded flex items-center gap-1"><Hotel size={10} /> Hotel</span>}
                      {sub.grantCoverage?.ticket && <span className="text-[8px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 px-2 py-1 rounded flex items-center gap-1"><Ticket size={10} /> Ticket</span>}
                      {sub.grantCoverage?.stipend && <span className="text-[8px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 px-2 py-1 rounded flex items-center gap-1"><DollarSign size={10} /> Stipend</span>}
                    </div>

                    <div className="text-[10px] opacity-40 uppercase tracking-widest">Submitted by: {sub.submitterName} ({sub.submitterEmail})</div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function LandingView({ onGetStarted, onLogin, onViewSectors, onViewSuccessStories, onViewAbout, approvedSubmissions = [] }: { onGetStarted: () => void, onLogin: () => void, onViewSectors: () => void, onViewSuccessStories: () => void, onViewAbout: () => void, approvedSubmissions?: any[] }) {
  return (
    <div className="min-h-screen bg-space-bg text-white font-sans overflow-x-hidden selection:bg-lime-accent selection:text-space-bg">
      {/* Promotional Nav */}
      <nav className="px-4 md:px-6 py-6 md:py-8 relative z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Logo size={40} mdSize={48} />
          <div className="flex items-center gap-4 md:gap-8">
            <button 
              onClick={onViewAbout}
              className="text-[10px] font-bold uppercase tracking-widest hover:text-lime-accent transition-colors"
            >
              Our Mission
            </button>
            <button 
              onClick={onViewSuccessStories}
              className="text-[10px] font-bold uppercase tracking-widest hover:text-lime-accent transition-colors"
            >
              Success Stories
            </button>
            <button 
              onClick={onLogin}
              className="text-[10px] font-bold uppercase tracking-widest hover:text-lime-accent transition-colors"
            >
              Sign In
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-16 md:pt-24 pb-32 md:pb-48 px-4 md:px-6">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
           >
            
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-8xl font-bold tracking-tighter uppercase mb-8 md:mb-12 leading-[0.9]"
          >
            Bridge the <br />
            <span className="text-lime-accent">Opportunity</span> Gap
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-base md:text-xl text-white/40 max-w-2xl mx-auto mb-12 md:mb-16 font-light leading-relaxed"
          >
            The ultimate command center for underrepresented technologists. 
            Find, track, and secure funding for global tech conferences with AI-powered precision.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6"
          >
            <button 
              onClick={onGetStarted}
              className="w-full md:w-auto px-8 md:px-12 py-4 md:py-6 bg-lime-accent text-space-bg rounded-2xl font-bold text-[10px] md:text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_40px_rgba(193,255,114,0.2)]"
            >
              Create Profile
            </button>
          </motion.div>
        </div>

        {/* Background Elements */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-lime-accent/10 blur-[120px] rounded-full"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 blur-[120px] rounded-full"></div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 md:py-24 px-4 md:px-6 border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto grid grid-cols-3 gap-4 md:gap-12">
          {[
            { label: 'Verified Grants', value: '500+', icon: <ShieldCheck size={20} className="md:w-6 md:h-6" /> },
            { label: 'Success Rate', value: '85%', icon: <Zap size={20} className="md:w-6 md:h-6" /> },
            { label: 'Community Members', value: '12k', icon: <User size={20} className="md:w-6 md:h-6" /> },
          ].map((stat, i) => (
            <div key={i} className="text-center space-y-2 md:space-y-4">
              <div className="w-10 h-10 md:w-16 md:h-16 bg-white/5 rounded-xl md:rounded-2xl flex items-center justify-center text-lime-accent mx-auto mb-2 md:mb-6">
                {stat.icon}
              </div>
              <div className="text-xl md:text-4xl font-bold tracking-tighter">{stat.value}</div>
              <div className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest opacity-40 leading-tight">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectorsView({ onBack, onGetStarted }: { onBack: () => void, onGetStarted: () => void }) {
  return (
    <div className="min-h-screen bg-space-bg text-white font-sans p-6 md:p-12 selection:bg-lime-accent selection:text-space-bg">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-16">
          <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">
            <ChevronRight size={14} className="rotate-180" /> Back to Landing
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-lime-accent rounded-full animate-pulse"></div>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Sector Analysis Active</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-accent/10 border border-lime-accent/20 mb-6">
              <Globe size={12} className="text-lime-accent" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-lime-accent">Global Coverage</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tighter uppercase mb-6">Open Sectors</h2>
            <p className="text-white/40 font-light leading-relaxed">
              Explore funding opportunities across these geographic sectors. Each region has specialized grants and support networks for underrepresented technologists.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { name: 'North America', count: 142, icon: <Globe size={24} />, color: 'bg-blue-500' },
            { name: 'Europe', count: 98, icon: <Globe size={24} />, color: 'bg-purple-500' },
            { name: 'Africa', count: 64, icon: <Globe size={24} />, color: 'bg-orange-500' },
            { name: 'Asia-Pacific', count: 87, icon: <Globe size={24} />, color: 'bg-lime-accent' },
            { name: 'Latin America', count: 45, icon: <Globe size={24} />, color: 'bg-pink-500' },
            { name: 'Middle East', count: 32, icon: <Globe size={24} />, color: 'bg-teal-500' },
            { name: 'Global / Remote', count: 112, icon: <Zap size={24} />, color: 'bg-indigo-500' },
            { name: 'Emerging Markets', count: 28, icon: <Sparkles size={24} />, color: 'bg-yellow-500' },
          ].map((sector, i) => (
            <motion.div 
              key={i}
              whileHover={{ y: -5 }}
              className="bento-card group cursor-pointer"
              onClick={onGetStarted}
            >
              <div className={`w-12 h-12 ${sector.color}/10 rounded-xl flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform`}>
                {sector.icon}
              </div>
              <h3 className="text-xl font-bold tracking-tight mb-2">{sector.name}</h3>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">{sector.count} Active Grants</span>
                <ChevronRight size={14} className="text-lime-accent opacity-0 group-hover:opacity-100 transition-all" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AboutView({ onBack, onGetStarted }: { onBack: () => void, onGetStarted: () => void }) {
  return (
    <div className="min-h-screen bg-space-bg text-white font-sans p-6 md:p-12 selection:bg-lime-accent selection:text-space-bg">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-16">
          <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">
            <ChevronRight size={14} className="rotate-180" /> Back to Landing
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-lime-accent rounded-full animate-pulse"></div>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Our Mission</span>
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-16"
        >
          <header>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter uppercase mb-8 leading-none">
              Access is the <br />
              <span className="text-lime-accent">Ultimate Bridge</span>
            </h1>
            <p className="text-xl md:text-2xl text-white/60 font-light leading-relaxed">
              Attending tech conferences shouldn’t depend on your financial situation.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-lime-accent">
                <Target size={24} />
              </div>
              <h3 className="text-xl font-bold uppercase tracking-tight">The Problem</h3>
              <p className="text-white/40 leading-relaxed">
                Too often, incredible opportunities like conferences, fellowships, and travel grants, are scattered across the internet, hard to find, and easy to miss. For many students, early-career engineers, and international applicants, the biggest barrier isn’t talent, it’s access.
              </p>
            </div>
            <div className="space-y-6">
              <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-lime-accent">
                <Heart size={24} />
              </div>
              <h3 className="text-xl font-bold uppercase tracking-tight">The Inspiration</h3>
              <p className="text-white/40 leading-relaxed">
                I built this platform from personal experience. Like many others, I’ve spent hours searching for opportunities, worrying about costs, and trying to figure out how to attend events that could shape my career. I realized that the problem wasn’t a lack of opportunities, it was a lack of visibility.
              </p>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-[32px] p-8 md:p-12">
            <div className="flex flex-col md:flex-row gap-12 items-center">
              <div className="flex-1 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-accent/10 border border-lime-accent/20">
                  <Sparkles size={12} className="text-lime-accent" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-lime-accent">The Solution</span>
                </div>
                <h2 className="text-3xl font-bold tracking-tight">Centralizing Visibility</h2>
                <p className="text-white/60 leading-relaxed">
                  This platform brings together conferences that offer travel grants, scholarships, and funded access into one place. The goal is simple: help you find opportunities faster, apply with confidence, and show up in spaces where you belong.
                </p>
              </div>
              <div className="w-full md:w-64 aspect-square bg-lime-accent/5 rounded-2xl flex items-center justify-center relative overflow-hidden">
                <Globe size={120} className="text-lime-accent/20 absolute -bottom-10 -right-10" />
                <div className="relative z-10 text-center p-6">
                  <div className="text-4xl font-bold tracking-tighter text-lime-accent mb-2">100%</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-40">Funded Opportunities</div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center space-y-8 py-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tighter uppercase">Join the Community</h2>
            <p className="text-white/40 max-w-2xl mx-auto leading-relaxed">
              This is more than a tool, it’s a growing community. If you discover an opportunity, share it. If this platform helps you, tell someone else. Together, we can make access to tech opportunities more open, more visible, and more equitable.
            </p>
            <button 
              onClick={onGetStarted}
              className="px-12 py-6 bg-lime-accent text-space-bg rounded-2xl font-bold text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_40px_rgba(193,255,114,0.2)]"
            >
              Get Started Today
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function SuccessStoriesView({ onBack, onGetStarted, conferences, onAddReview, isLoggedIn }: { 
  onBack: () => void, 
  onGetStarted: () => void,
  conferences: Conference[],
  onAddReview: (confId: string, rating: number, comment: string) => void,
  isLoggedIn: boolean
}) {
  const [isReviewing, setIsReviewing] = useState(false);
  const [selectedConfId, setSelectedConfId] = useState<string>('');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'reviews'),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedReviews = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Review[];
      setReviews(fetchedReviews);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reviews');
      toast.error("Real-time updates failed. Please ensure your domain is authorized in Firebase.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-space-bg text-white font-sans p-6 md:p-12 selection:bg-lime-accent selection:text-space-bg">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-16">
          <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">
            <ChevronRight size={14} className="rotate-180" /> Back
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-lime-accent rounded-full animate-pulse"></div>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Impact Verification Active</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-accent/10 border border-lime-accent/20 mb-6">
              <Award size={12} className="text-lime-accent" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-lime-accent">Success Stories</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tighter uppercase mb-6">IMPACT</h2>
            <p className="text-white/40 font-light leading-relaxed">
              Real stories from technologists who secured funding and accelerated their careers through GrantPrix.
            </p>
          </div>
          {isLoggedIn && (
            <button 
              onClick={() => setIsReviewing(true)}
              className="btn-lime px-8 py-4 flex items-center gap-2"
            >
              <MessageSquare size={16} /> Write Review
            </button>
          )}
        </div>

        {isReviewing && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bento-card p-8 mb-16 max-w-2xl mx-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs font-bold uppercase tracking-widest">Share Your Success</h3>
              <button onClick={() => setIsReviewing(false)} className="opacity-40 hover:opacity-100"><X size={16} /></button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 block">Select Conference</label>
                <select 
                  value={selectedConfId}
                  onChange={(e) => setSelectedConfId(e.target.value)}
                  className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs outline-none focus:border-lime-accent transition-all"
                >
                  <option key="placeholder" value="">Choose a grant...</option>
                  {conferences.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <ReviewForm 
                onSubmit={(rating, comment) => {
                  if (selectedConfId) {
                    onAddReview(selectedConfId, rating, comment);
                    setIsReviewing(false);
                    setSelectedConfId('');
                  } else {
                    toast.error('Please select a conference first');
                  }
                }}
                onCancel={() => setIsReviewing(false)}
              />
            </div>
          </motion.div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-24">
            <Loader2 className="animate-spin text-lime-accent" size={48} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {reviews.length > 0 ? (
              reviews.map((review) => (
                <motion.div 
                  key={review.id}
                  whileHover={{ y: -5 }}
                  className="bento-card p-8 flex flex-col md:flex-row gap-8"
                >
                  <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 border border-white/10 bg-white/5 flex items-center justify-center">
                    <User size={32} className="text-white/20" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-bold tracking-tight">{review.userName}</h3>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Sparkles key={i} size={10} className={i < review.rating ? "text-lime-accent" : "text-white/10"} />
                        ))}
                      </div>
                    </div>
                    <div className="text-xs font-bold uppercase tracking-widest opacity-40 mb-4">
                      Conference: {conferences.find(c => c.id === review.conferenceId)?.name || 'Unknown'}
                    </div>
                    <p className="text-white/60 font-light leading-relaxed italic">"{review.comment}"</p>
                  </div>
                </motion.div>
              ))
            ) : (
              SUCCESS_STORIES.map((story) => (
                <motion.div 
                  key={story.id}
                  whileHover={{ y: -5 }}
                  className="bento-card p-8 flex flex-col md:flex-row gap-8"
                >
                  <div className="w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 border border-white/10">
                    <img 
                      src={story.avatarUrl} 
                      alt={story.userName} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                      }}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-bold tracking-tight">{story.userName}</h3>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-lime-accent bg-lime-accent/10 px-2 py-0.5 rounded-full">{story.userRole}</span>
                    </div>
                    <div className="text-xs font-bold uppercase tracking-widest opacity-40 mb-4">Conference: {story.conferenceName}</div>
                    <p className="text-white/60 font-light leading-relaxed italic">"{story.story}"</p>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}

        <div className="mt-24 text-center">
          <h3 className="text-2xl font-bold uppercase tracking-tighter mb-8">Ready to write your own story?</h3>
          <button onClick={onGetStarted} className="btn-lime px-12 py-6">Create Profile</button>
        </div>
      </div>
    </div>
  );
}

function AuthView({ view, onSwitch }: { view: 'login' | 'signup', onSwitch: (v: 'login' | 'signup') => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setPhotoURL(compressed);
      } catch (err) {
        console.error("Image compression failed:", err);
        toast.error("Failed to process image. Please try a smaller file.");
      }
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }
    
    // Email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResetSent(false);

    try {
      // 1. Pre-check if email exists in our registered_emails collection
      try {
        const emailDoc = await getDoc(doc(db, 'registered_emails', email.toLowerCase().trim()));
        if (!emailDoc.exists()) {
          // Check fetchSignInMethodsForEmail as a fallback
          try {
            const methods = await fetchSignInMethodsForEmail(auth, email);
            if (methods.length === 0) {
              setError("This email is not registered yet. Please create an account to login.");
              setIsLoading(false);
              return;
            }
          } catch (authErr: any) {
            // If both fail, we can't be sure, so we proceed to try sending the reset email
            // to avoid blocking registered users if enumeration protection is on.
            console.warn("fetchSignInMethodsForEmail failed during reset:", authErr);
          }
        }
      } catch (e: any) {
        console.warn("registered_emails check failed during reset:", e);
      }

      await sendPasswordResetEmail(auth, email);
      toast.success("Password reset email sent! Check your inbox.");
      setResetSent(true);
    } catch (err: any) {
      console.error("Password Reset Error:", err);
      const errorCode = err?.code || '';
      if (errorCode === 'auth/user-not-found') {
        setError("This email is not registered yet. Please create an account to login.");
      } else if (errorCode === 'auth/invalid-email') {
        setError("Please enter a valid email address.");
      } else {
        setError(err.message || "Failed to send reset email. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address (e.g., user@example.com).");
      setIsLoading(false);
      return;
    }

    try {
      if (view === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Create registered_emails doc on signup
        try {
          await setDoc(doc(db, 'registered_emails', email.toLowerCase().trim()), { registered: true });
        } catch (e) {
          console.warn("Failed to create registered_emails on signup:", e);
        }
        
        // Send verification email
        await sendEmailVerification(userCredential.user);
        
        if (displayName || photoURL) {
          await updateProfile(userCredential.user, {
            displayName: displayName || undefined,
            photoURL: photoURL || undefined
          });
          // Ensure Firestore profile is updated with these values
          // The auth listener might have already created it with empty values
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            email: userCredential.user.email || '',
            displayName: displayName || '',
            photoURL: photoURL || ''
          }, { merge: true });
        }
      } else {
        // 1. Pre-check if email exists in our registered_emails collection
        // We don't return early here to avoid blocking old users who aren't in the collection yet
        let isLikelyNotRegistered = false;
        try {
          const emailDoc = await getDoc(doc(db, 'registered_emails', email.toLowerCase().trim()));
          if (!emailDoc.exists()) {
            // Check fetchSignInMethodsForEmail as a fallback
            try {
              const methods = await fetchSignInMethodsForEmail(auth, email);
              if (methods.length === 0) {
                isLikelyNotRegistered = true;
              }
            } catch (authErr: any) {
              // If both fail, we can't be sure, so we assume it might be registered to be safe
              // and avoid blocking existing users if enumeration protection is on.
              isLikelyNotRegistered = false;
            }
          }
        } catch (e: any) {
          console.warn("registered_emails check failed:", e);
        }

        try {
          await signInWithEmailAndPassword(auth, email, password);

          // Ensure registered_emails doc exists for existing users on successful login
          try {
            await setDoc(doc(db, 'registered_emails', email.toLowerCase().trim()), { registered: true });
          } catch (e) {
            console.warn("Failed to update registered_emails on login:", e);
          }
        } catch (err: any) {
          const errorCode = err?.code || '';
          const errorMessage = err?.message || '';
          const errorStr = String(err);
          
          const isInvalidCredential = 
            errorCode === 'auth/invalid-credential' || 
            errorCode === 'auth/user-not-found' ||
            errorMessage.includes('auth/invalid-credential') ||
            errorMessage.includes('auth/user-not-found') ||
            errorStr.includes('auth/invalid-credential') ||
            errorStr.includes('auth/user-not-found');

          if (errorCode === 'auth/operation-not-allowed') {
            console.error("Auth Configuration Error:", err);
            setError("Email/Password authentication is not enabled in the Firebase console.");
          } else if (isInvalidCredential) {
            console.warn("Auth Failure (User not found or invalid credentials):", err);
            if (isLikelyNotRegistered) {
              setError("This email is not registered yet. Please create an account to login.");
            } else {
              setError("Incorrect password. Please try again.");
            }
          } else if (errorCode === 'auth/wrong-password' || errorMessage.includes('auth/wrong-password')) {
            console.warn("Auth Failure (Wrong password):", err);
            setError("Incorrect password. Please try again.");
          } else if (errorCode === 'auth/email-already-in-use' || errorMessage.includes('auth/email-already-in-use')) {
            console.warn("Auth Failure (Email already in use):", err);
            setError("This email is already registered. Please log in instead.");
          } else if (errorCode === 'auth/invalid-email' || errorMessage.includes('auth/invalid-email')) {
            console.warn("Auth Failure (Invalid email):", err);
            setError("Please enter a valid email address.");
          } else if (errorCode === 'auth/weak-password' || errorMessage.includes('auth/weak-password')) {
            console.warn("Auth Failure (Weak password):", err);
            setError("Password should be at least 6 characters.");
          } else {
            console.error("Auth Error:", err);
            setError(errorMessage || "An unexpected authentication error occurred.");
          }
          setIsLoading(false);
          return;
        }
      }
    } catch (err: any) {
      const errorCode = err?.code || '';
      const errorMessage = err?.message || '';
      
      if (errorCode === 'auth/email-already-in-use') {
        setError("This email is already registered. Please log in instead.");
      } else {
        console.error("Auth Error:", err);
        setError(errorMessage || "An unexpected authentication error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    setIsLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Google Sign-In Error:", err);
      setError("Google Sign-In failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-space-bg flex items-center justify-center p-4 md:p-6 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-lime-accent/5 rounded-full blur-[120px]"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bento-card max-w-sm md:max-w-md w-full relative z-10 p-6 md:p-10"
      >
        <div className="text-center mb-8 md:mb-10">
          <Logo size={48} mdSize={64} className="mx-auto mb-6" />
          <h2 className="text-2xl md:text-3xl font-bold tracking-tighter uppercase">{view === 'login' ? 'Welcome Back' : 'Join Community'}</h2>
          <p className="text-white/40 text-xs md:text-sm mt-2 font-light">Access the global grant command center.</p>
        </div>

        <div className="space-y-6">
          <button 
            onClick={handleGoogleSignIn}
            className="w-full bg-white/5 border border-white/10 text-white py-4 rounded-[16px] font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-white/10 transition-all"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" referrerPolicy="no-referrer" />
            Continue with Google
          </button>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/5"></div>
            </div>
            
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-[12px] text-xs font-bold uppercase tracking-widest text-center"
              >
                {error}
              </motion.div>
            )}

            {resetSent && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-lime-accent/10 border border-lime-accent/20 text-lime-accent p-4 rounded-[12px] text-xs font-bold uppercase tracking-widest text-center"
              >
                Password reset link sent to your email!
              </motion.div>
            )}
            <div className="space-y-4">
              {view === 'signup' && (
                <>
                

                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-bold mb-2 block opacity-40">User Identity (Username)</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. CyberHunter"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-space-bg border border-space-border rounded-[12px] py-4 px-5 focus:outline-none focus:border-lime-accent transition-all text-white"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-[10px] uppercase tracking-widest font-bold mb-2 block opacity-40">Email Address</label>
                <input 
                  type="email" 
                  required
                  placeholder="user@grantpath.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-space-bg border border-space-border rounded-[12px] py-4 px-5 focus:outline-none focus:border-lime-accent transition-all text-white"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-bold mb-2 block opacity-40">Password</label>
                <input 
                  type="password" 
                  required
                  placeholder="enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-space-bg border border-space-border rounded-[12px] py-4 px-5 focus:outline-none focus:border-lime-accent transition-all text-white"
                />
                {view === 'login' && (
                  <div className="flex justify-end mt-2">
                    <button 
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-[10px] text-lime-accent hover:underline font-bold uppercase tracking-widest"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="btn-lime w-full flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="animate-spin" /> : (view === 'login' ? 'Initialize Session' : 'Create Account')}
            </button>
          </form>

          <p className="text-center text-xs text-white/30 font-light">
            {view === 'login' ? "New user?" : "Existing user?"}{' '}
            <button 
              onClick={() => onSwitch(view === 'login' ? 'signup' : 'login')}
              className="text-lime-accent font-bold hover:underline"
            >
              {view === 'login' ? 'Register' : 'Authenticate'}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function WelcomeView({ user, initialProfile, onComplete }: { user: FirebaseUser, initialProfile: UserProfile | null, onComplete: (profile: UserProfile) => void }) {
  const [location, setLocation] = useState(initialProfile?.location || '');
  const [occupation, setOccupation] = useState(initialProfile?.occupation || '');
  const [primaryGoal, setPrimaryGoal] = useState(initialProfile?.primaryGoal || '');
  const [experienceYears, setExperienceYears] = useState<number>(initialProfile?.experienceYears || 0);
  const [interests, setInterests] = useState<string[]>(initialProfile?.interests || []);
  const [impactAreas, setImpactAreas] = useState<string[]>(initialProfile?.impactAreas || []);
  const [photoURL, setPhotoURL] = useState(initialProfile?.photoURL || user.photoURL || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setPhotoURL(compressed);
      } catch (err) {
        console.error("Image compression failed:", err);
        toast.error("Failed to process image. Please try a smaller file.");
      }
    }
  };

  const handleComplete = async () => {
    if (!location || !occupation || !primaryGoal) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const profile: UserProfile = {
        ...initialProfile,
        uid: user.uid,
        email: user.email || '',
        displayName: initialProfile?.displayName || user.displayName || '',
        photoURL: photoURL,
        location,
        occupation,
        primaryGoal,
        experienceYears: isNaN(experienceYears) ? 0 : experienceYears,
        interests,
        impactAreas,
        isPremium: initialProfile?.isPremium || false,
        aiReviewCount: initialProfile?.aiReviewCount || 0,
        completionPercentage: 100,
        matchesFound: initialProfile?.matchesFound || 12,
        isVerified: !!user.emailVerified,
        createdAt: initialProfile?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await onComplete(profile);
    } catch (error) {
      console.error("WelcomeView handleComplete error:", error);
      toast.error("Failed to initialize profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-space-bg flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bento-card max-w-2xl w-full"
      >
        <div className="flex items-center gap-4 mb-8">
          <Logo size={40} showText={false} />
          <h2 className="text-2xl font-bold tracking-tighter uppercase">Initialize Profile</h2>
        </div>
        <div className="flex flex-col items-center mb-10">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full border-2 border-dashed border-lime-accent/20 flex items-center justify-center overflow-hidden transition-all">
              {photoURL ? (
                <img 
                  src={photoURL} 
                  className="w-full h-full object-cover" 
                  alt="Preview" 
                  referrerPolicy="no-referrer" 
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                  }}
                />
              ) : (
                <div className="w-full h-full bg-white/5 flex items-center justify-center text-white/20">
                  <User size={40} />
                </div>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 bg-lime-accent text-space-bg p-1.5 rounded-full shadow-lg hover:scale-110 transition-all"
            >
              <Plus size={14} />
            </button>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 mt-3">Upload Profile Picture</span>
        </div>

        <div className="flex items-center gap-6 mb-10 p-4 bg-white/5 rounded-2xl border border-white/5">
          <div className="w-20 h-20 rounded-full border-2 border-lime-accent/20 overflow-hidden flex-shrink-0">
            {photoURL ? (
              <img 
                src={photoURL} 
                className="w-full h-full object-cover" 
                alt="Profile" 
                referrerPolicy="no-referrer" 
                onError={(e) => {
                  (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                }}
              />
            ) : (
              <div className="w-full h-full bg-white/5 flex items-center justify-center text-white/20">
                <User size={32} />
              </div>
            )}
          </div>
          <div>
            <h3 className="text-xl font-bold tracking-tight text-white">Welcome, {initialProfile?.displayName || user.displayName || 'Agent'}</h3>
            <p className="text-xs text-white/40 font-medium uppercase tracking-widest mt-1">Status: Initializing Protocol</p>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Current Location <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Nairobi, Kenya"
              className="w-full bg-space-bg border border-space-border rounded-[12px] px-4 py-3 focus:border-lime-accent outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Occupation (Job Title or Major) <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="e.g. Software Engineer or CS Student"
              className="w-full bg-space-bg border border-space-border rounded-[12px] px-4 py-3 focus:border-lime-accent outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Primary Career Goal <span className="text-red-500">*</span></label>
            <select 
              value={primaryGoal}
              onChange={(e) => setPrimaryGoal(e.target.value)}
              className="w-full bg-space-bg border border-space-border rounded-[12px] px-4 py-3 focus:border-lime-accent outline-none transition-colors"
            >
              <option key="placeholder" value="">Select Goal</option>
              <option key="Networking" value="Networking">Networking & Community</option>
              <option key="Learning" value="Learning">Skill Acquisition</option>
              <option key="Speaking" value="Speaking">Public Speaking</option>
              <option key="Job" value="Job">Career Advancement</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Years of Experience</label>
              <input 
                type="number" 
                value={experienceYears}
                onChange={(e) => setExperienceYears(parseInt(e.target.value))}
                className="w-full bg-space-bg border border-space-border rounded-[12px] px-4 py-3 focus:border-lime-accent outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Tech Focus Areas</label>
              <div className="flex flex-wrap gap-2">
                {['Web3', 'AI/ML', 'Open Source', 'Cybersecurity', 'Cloud Native', 'FinTech', 'DBA'].map(area => (
                  <button
                    key={area}
                    onClick={() => setImpactAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area])}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${impactAreas.includes(area) ? 'bg-lime-accent text-space-bg border-lime-accent' : 'border-space-border opacity-40'}`}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Core Interests</label>
              <div className="flex flex-wrap gap-2">
                {['Sustainability', 'Education', 'HealthTech', 'Social Impact', 'Diversity', 'Research'].map(interest => (
                  <button
                    key={interest}
                    onClick={() => setInterests(prev => prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest])}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${interests.includes(interest) ? 'bg-lime-accent text-space-bg border-lime-accent' : 'border-space-border opacity-40'}`}
                  >
                    {interest}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button 
            onClick={handleComplete}
            disabled={!location || !occupation || !primaryGoal || isSubmitting}
            className="btn-lime w-full disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-space-bg/30 border-t-space-bg rounded-full animate-spin" />
                Initializing...
              </>
            ) : (
              'GrantPrix Profile'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ProfileView({ user, initialProfile, onSave, onBack, onUpgrade, isUpgrading, onFileUpload, onSettings }: { 
  user: FirebaseUser, 
  initialProfile: UserProfile | null,
  onSave: (profile: UserProfile) => void,
  onBack: () => void,
  onUpgrade: () => void,
  isUpgrading: boolean,
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void,
  onSettings: () => void
}) {
  const [displayName, setDisplayName] = useState(initialProfile?.displayName || user.displayName || '');
  const [location, setLocation] = useState(initialProfile?.location || '');
  const [occupation, setOccupation] = useState(initialProfile?.occupation || '');
  const [primaryGoal, setPrimaryGoal] = useState(initialProfile?.primaryGoal || '');

  const badges = [
    { id: 1, name: 'Early Adopter', icon: <Zap size={14} />, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    { id: 2, name: 'Grant Hunter', icon: <Target size={14} />, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { id: 3, name: 'AI Pioneer', icon: <Cpu size={14} />, color: 'text-purple-400', bg: 'bg-purple-400/10' },
  ];

  return (
    <div className="min-h-screen bg-space-bg p-4 md:p-12 selection:bg-lime-accent selection:text-space-bg">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8 md:mb-12">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="flex items-center gap-2 text-[9px] md:text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">
              <ChevronRight size={14} className="rotate-180" /> Back to Dashboard
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-lime-accent rounded-full animate-pulse"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Profile Sync Active</span>
            </div>
            <button 
              onClick={onSettings}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-all text-white/40 hover:text-lime-accent"
              title="Account Settings"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Identity & Stats */}
          <div className="lg:col-span-4 space-y-8">
            <div className="bento-card text-center py-12">
              <div className="relative inline-block group">
                <div className="w-40 h-40 rounded-full border-2 border-space-border overflow-hidden bg-space-bg flex items-center justify-center p-1">
                  <div className="w-full h-full rounded-full overflow-hidden">
                    {initialProfile?.photoURL ? (
                      <img 
                        src={initialProfile.photoURL} 
                        alt="Profile" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer" 
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex items-center justify-center text-white/20">
                        <User size={64} />
                      </div>
                    )}
                  </div>
                </div>
                <label className="absolute bottom-2 right-2 w-12 h-12 bg-lime-accent rounded-full flex items-center justify-center text-space-bg cursor-pointer hover:scale-110 transition-transform shadow-[0_0_20px_rgba(193,255,114,0.4)]">
                  <Plus size={24} />
                  <input type="file" className="hidden" onChange={onFileUpload} accept="image/*" />
                </label>
              </div>
              <div className="mt-8">
                <h3 className="text-2xl font-bold tracking-tight">{displayName || 'Anonymous User'}</h3>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div className={`w-2 h-2 rounded-full ${initialProfile?.isVerified ? 'bg-lime-accent' : 'bg-yellow-500'}`}></div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${initialProfile?.isVerified ? 'text-lime-accent' : 'text-yellow-500'}`}>
                    {initialProfile?.isPremium ? 'verified Pro' : (initialProfile?.isVerified ? 'Verified' : 'Pending')}
                  </span>
                </div>
              </div>
              <p className="text-white/40 text-sm font-light mt-4">{location || 'Global Citizen'}</p>
              
              <div className="flex flex-wrap justify-center gap-2 mt-8">
                {badges.map(badge => (
                  <div key={badge.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/5 ${badge.bg} ${badge.color} text-[10px] font-bold uppercase tracking-widest`}>
                    {badge.icon} {badge.name}
                  </div>
                ))}
              </div>
            </div>

            {!initialProfile?.isPremium && (
              <div className="bento-card bg-gradient-to-br from-lime-accent/20 to-transparent border-lime-accent/30 p-8">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-lg font-bold text-lime-accent">PRO UPGRADE</h4>
                  <span className="text-xs font-bold text-lime-accent/60">$10/mo</span>
                </div>
                <p className="text-xs text-white/60 mb-6 leading-relaxed">Unlock the full potential of GrantPrix with unlimited AI reviews, personalized recommendations, and insider insights.</p>
                <ul className="space-y-3 mb-8">
                  {[
                    'Unlimited AI Reviews',
                    'Personalized Recommendations',
                    'Insider Insights',
                    'Priority Email Support',
                    'Real-time Grant Alerts'
                  ].map((benefit, i) => (
                    <li key={i} className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-white/80">
                      <CheckCircle size={14} className="text-lime-accent" />
                      {benefit}
                    </li>
                  ))}
                </ul>
                <button 
                  onClick={onUpgrade} 
                  disabled={isUpgrading}
                  className="btn-lime w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUpgrading ? <Loader2 className="animate-spin" size={16} /> : null}
                  {isUpgrading ? 'Initializing...' : 'Initialize Upgrade'}
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Configuration & Neural Profile */}
          <div className="lg:col-span-8 space-y-8">
            <div className="bento-card">
              <h3 className="text-xs font-bold uppercase tracking-widest opacity-50 mb-8">System Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Display Identity</label>
                    <input 
                      type="text" 
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-space-bg border border-space-border rounded-[12px] px-5 py-4 focus:border-lime-accent outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Geographic Sector</label>
                    <input 
                      type="text" 
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full bg-space-bg border border-space-border rounded-[12px] px-5 py-4 focus:border-lime-accent outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Occupation</label>
                    <input 
                      type="text" 
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      placeholder="Job title or major"
                      className="w-full bg-space-bg border border-space-border rounded-[12px] px-5 py-4 focus:border-lime-accent outline-none transition-all text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Mission Objective</label>
                    <select 
                      value={primaryGoal}
                      onChange={(e) => setPrimaryGoal(e.target.value)}
                      className="w-full bg-space-bg border border-space-border rounded-[12px] px-5 py-4 focus:border-lime-accent outline-none transition-all text-sm appearance-none"
                    >
                      <option key="Networking" value="Networking">Networking & Community</option>
                      <option key="Learning" value="Learning">Skill Acquisition</option>
                      <option key="Speaking" value="Speaking">Public Speaking</option>
                      <option key="Job" value="Job">Career Advancement</option>
                    </select>
                  </div>
                  <div className="pt-8">
                    <button 
                      onClick={() => {
                        const updatedProfile = { 
                          ...initialProfile!, 
                          displayName: displayName || '', 
                          location: location || '', 
                          occupation: occupation || '', 
                          primaryGoal: primaryGoal || '' 
                        };
                        // Remove undefined fields
                        Object.keys(updatedProfile).forEach(key => {
                          if ((updatedProfile as any)[key] === undefined) {
                            delete (updatedProfile as any)[key];
                          }
                        });
                        onSave(updatedProfile);
                      }}
                      className="btn-lime w-full"
                    >
                      Sync Changes
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bento-card">
                <div className="flex items-center gap-3 mb-8">
                  <Cpu size={18} className="text-lime-accent" />
                  <h3 className="text-xs font-bold uppercase tracking-widest opacity-50">Neural Profile</h3>
                </div>
                <div className="space-y-8">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-4 block">Core Interests</label>
                    <div className="flex flex-wrap gap-2">
                      {initialProfile?.interests?.map(tag => (
                        <span key={tag} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-wider text-lime-accent">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-4 block">Impact Vectors</label>
                    <div className="flex flex-wrap gap-2">
                      {initialProfile?.impactAreas?.map(tag => (
                        <span key={tag} className="px-4 py-2 bg-lime-accent/10 border border-lime-accent/20 rounded-xl text-[10px] font-bold uppercase tracking-wider text-lime-accent">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bento-card">
                <div className="flex items-center gap-3 mb-8">
                  <Activity size={18} className="text-lime-accent" />
                  <h3 className="text-xs font-bold uppercase tracking-widest opacity-50">Activity Log</h3>
                </div>
                <div className="space-y-6">
                  {[
                    { action: 'Profile Initialized', time: '2h ago', icon: <CheckCircle size={12} /> },
                    { action: 'AI Review Requested', time: '1d ago', icon: <Sparkles size={12} /> },
                    { action: 'System Authenticated', time: '3d ago', icon: <Zap size={12} /> },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between group cursor-default">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-lime-accent group-hover:bg-lime-accent group-hover:text-space-bg transition-all">
                          {item.icon}
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 group-hover:opacity-100 transition-opacity">{item.action}</span>
                      </div>
                      <span className="text-[8px] font-bold uppercase tracking-widest opacity-20">{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardView({ 
  profile, 
  conferences, 
  onViewDetails, 
  onOpenAI, 
  onProfile, 
  onSettings, 
  onLogout, 
  onSaveConference, 
  onRealTimeSearch, 
  isLoading, 
  onShareOpportunity, 
  onAdmin, 
  isAdmin, 
  approvedSubmissions = [], 
  notifications = [], 
  onMarkAsRead,
  searchTerm,
  setSearchTerm,
  selectedRegion,
  setSelectedRegion,
  selectedLocationType,
  setSelectedLocationType,
  selectedFundingType,
  setSelectedFundingType,
  selectedDeadline,
  setSelectedDeadline,
  selectedField,
  setSelectedField,
  selectedCoverage,
  setSelectedCoverage,
  activeTab,
  setActiveTab,
  visibleCount,
  setVisibleCount
}: { 
  profile: UserProfile, 
  conferences: Conference[],
  onViewDetails: (conf: Conference) => void,
  onOpenAI: (conf: Conference) => void,
  onProfile: () => void,
  onSettings: () => void,
  onLogout: () => void,
  onSaveConference: (id: string) => void,
  onRealTimeSearch: (query: string) => void,
  isLoading: boolean,
  onShareOpportunity: () => void,
  onAdmin: () => void,
  isAdmin: boolean,
  approvedSubmissions?: any[],
  notifications?: AppNotification[],
  onMarkAsRead?: (id: string) => void,
  searchTerm: string,
  setSearchTerm: (val: string) => void,
  selectedRegion: Region | 'All',
  setSelectedRegion: (val: Region | 'All') => void,
  selectedLocationType: LocationType | 'All',
  setSelectedLocationType: (val: LocationType | 'All') => void,
  selectedFundingType: FundingType | 'All',
  setSelectedFundingType: (val: FundingType | 'All') => void,
  selectedDeadline: 'All' | 'Urgent' | 'Upcoming',
  setSelectedDeadline: (val: 'All' | 'Urgent' | 'Upcoming') => void,
  selectedField: string,
  setSelectedField: (val: string) => void,
  selectedCoverage: 'All' | 'Flight' | 'Hotel' | 'Ticket' | 'Stipend',
  setSelectedCoverage: (val: 'All' | 'Flight' | 'Hotel' | 'Ticket' | 'Stipend') => void,
  activeTab: 'all' | 'saved',
  setActiveTab: (val: 'all' | 'saved') => void,
  visibleCount: number,
  setVisibleCount: (val: number | ((prev: number) => number)) => void
}) {
  const [showNotifications, setShowNotifications] = useState(false);

  const displayConferences = useMemo(() => {
    let filtered = conferences;
    if (activeTab === 'saved') {
      filtered = filtered.filter(c => profile.savedConferences?.includes(c.id));
    }
    
    filtered = filtered?.filter(conf => {
      const matchesSearch = (conf.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
                           conf.tags?.some(tag => (tag || '').toLowerCase().includes((searchTerm || '').toLowerCase())) ||
                           (conf.field || '').toLowerCase().includes((searchTerm || '').toLowerCase());
      const matchesRegion = selectedRegion === 'All' || conf.region === selectedRegion;
      const matchesLocationType = selectedLocationType === 'All' || conf.locationType === selectedLocationType;
      const matchesFundingType = selectedFundingType === 'All' || conf.fundingType === selectedFundingType;
      const matchesField = selectedField === 'All' || conf.field === selectedField;
      
      let matchesCoverage = true;
      if (selectedCoverage === 'Flight') matchesCoverage = !!conf.grantCoverage?.flight;
      else if (selectedCoverage === 'Hotel') matchesCoverage = !!conf.grantCoverage?.hotel;
      else if (selectedCoverage === 'Ticket') matchesCoverage = !!conf.grantCoverage?.ticket;
      else if (selectedCoverage === 'Stipend') matchesCoverage = !!conf.grantCoverage?.stipend;

      let matchesDeadline = true;
      if (selectedDeadline === 'Urgent') {
        matchesDeadline = isDeadlineSoon(conf.grantDeadline);
      } else if (selectedDeadline === 'Upcoming') {
        const deadlineDate = new Date(conf.grantDeadline);
        const now = new Date();
        const diffTime = deadlineDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        matchesDeadline = diffDays > 30;
      }

      return matchesSearch && matchesRegion && matchesLocationType && matchesFundingType && matchesField && matchesDeadline && matchesCoverage;
    });

    return filtered;
  }, [conferences, activeTab, profile.savedConferences, searchTerm, selectedRegion, selectedLocationType, selectedFundingType, selectedDeadline, selectedField, selectedCoverage]);

  const paginatedConferences = useMemo(() => {
    return displayConferences.slice(0, visibleCount);
  }, [displayConferences, visibleCount]);

  const uniqueFields = useMemo(() => {
    const fields = new Set(conferences?.map(c => c.field).filter(Boolean));
    return ['All', ...Array.from(fields)];
  }, [conferences]);

  const recommendedConferences = useMemo(() => {
    if (!profile.isPremium) return [];
    
    // Simple logic: match by interests or field
    const userInterests = (profile.interests || []).map(i => i.toLowerCase());
    const userImpactAreas = (profile.impactAreas || []).map(i => i.toLowerCase());
    
    return conferences
      .filter(c => {
        const fieldMatch = userInterests.includes((c.field || '').toLowerCase());
        const tagMatch = c.tags?.some(tag => userInterests.includes(tag.toLowerCase()) || userImpactAreas.includes(tag.toLowerCase()));
        return fieldMatch || tagMatch;
      })
      .slice(0, 3);
  }, [conferences, profile.isPremium, profile.interests, profile.impactAreas]);

  const premiumAlerts = useMemo(() => {
    if (!profile.isPremium) return [];
    
    // "Best 5 grants this week" logic: 
    // - Verified grants
    // - Deadlines within next 30 days but not passed
    // - High coverage (flight, hotel, ticket)
    return conferences
      .filter(c => {
        const deadlineDate = new Date(c.grantDeadline);
        const now = new Date();
        const diffTime = deadlineDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const isVerified = c.isVerified;
        const isUpcoming = diffDays > 0 && diffDays <= 30;
        const hasGoodCoverage = c.grantCoverage?.flight && c.grantCoverage?.hotel && c.grantCoverage?.ticket;
        
        return isVerified && isUpcoming && hasGoodCoverage;
      })
      .sort((a, b) => new Date(a.grantDeadline).getTime() - new Date(b.grantDeadline).getTime())
      .slice(0, 5);
  }, [conferences, profile.isPremium]);

  const trackedApplications = useMemo(() => {
    return (profile.applications || []).map(app => {
      const conference = conferences.find(c => c.id === app.conferenceId);
      return { ...app, conference };
    }).filter(app => !!app.conference);
  }, [profile.applications, conferences]);

  return (
    <div className="min-h-screen bg-space-bg p-4 md:p-12">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-row justify-between items-center mb-8 md:mb-12 gap-2 md:gap-6">
          <div className="flex items-center gap-2 md:gap-4">
            <Logo size={32} mdSize={48} showText={false} />
            <div className="hidden sm:block">
              <h1 className="text-sm md:text-4xl font-bold tracking-tighter uppercase mb-0 md:mb-2">GrantPrix Profile</h1>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-lime-accent rounded-full animate-pulse"></div>
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">System Online</span>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-40">Sector: {profile.location}</div>
              </div>
            </div>
            <div className="sm:hidden">
              <h1 className="text-[10px] font-bold tracking-tighter uppercase">GrantPrix</h1>
              <div className="text-[8px] font-bold uppercase tracking-widest opacity-40">Sector: {profile.location}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            {isAdmin && (
              <button 
                onClick={onAdmin}
                className="p-2 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all"
                title="Admin Panel"
              >
                <ShieldCheck size={14} />
              </button>
            )}
            <button 
              onClick={onShareOpportunity}
              className="p-2 bg-lime-accent/10 border border-lime-accent/20 text-lime-accent rounded-full hover:bg-lime-accent hover:text-space-bg transition-all"
              title="Share Opportunity"
            >
              <Plus size={14} />
            </button>
            
            {/* Notifications Bell */}
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className={`p-2 rounded-full border transition-all relative ${
                  notifications.some(n => !n.isRead) 
                    ? 'bg-lime-accent/10 border-lime-accent/20 text-lime-accent' 
                    : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                }`}
              >
                <Bell size={14} />
                {notifications.some(n => !n.isRead) && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-space-bg"></span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-4 w-80 bg-space-card border border-space-border rounded-2xl shadow-2xl z-[100] overflow-hidden"
                  >
                    <div className="p-4 border-b border-white/5 flex justify-between items-center">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Notifications</h3>
                      {notifications.some(n => !n.isRead) && (
                        <button 
                          onClick={() => notifications.filter(n => !n.isRead).forEach(n => onMarkAsRead?.(n.id))}
                          className="text-[8px] font-bold uppercase tracking-widest text-lime-accent hover:underline"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>
                    <div className="max-h-[400px] overflow-y-auto no-scrollbar">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <Bell size={24} className="mx-auto opacity-10 mb-3" />
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-20">No notifications yet</p>
                        </div>
                      ) : (
                        notifications.map(notification => (
                          <div 
                            key={notification.id}
                            onClick={() => {
                              if (!notification.isRead) onMarkAsRead?.(notification.id);
                            }}
                            className={`p-4 border-b border-white/5 last:border-0 transition-colors cursor-pointer hover:bg-white/5 ${!notification.isRead ? 'bg-lime-accent/5' : ''}`}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <h4 className={`text-[11px] font-bold tracking-tight ${!notification.isRead ? 'text-lime-accent' : 'text-white/80'}`}>
                                {notification.title}
                              </h4>
                              <span className="text-[8px] font-bold uppercase tracking-widest opacity-20">
                                {new Date(notification.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-[10px] text-white/60 leading-relaxed line-clamp-2">
                              {notification.message}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button onClick={onProfile} className="flex items-center gap-2 bg-space-card border border-space-border p-1.5 md:px-4 md:py-2 rounded-full hover:border-lime-accent transition-all group">
              {profile.photoURL ? (
                <img 
                  src={profile.photoURL} 
                  className="w-5 h-5 md:w-6 md:h-6 rounded-full border border-white/10 object-cover" 
                  alt="User" 
                  referrerPolicy="no-referrer" 
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                  }}
                />
              ) : (
                <div className="w-5 h-5 md:w-6 md:h-6 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/20">
                  <User size={10} />
                </div>
              )}
              <span className="hidden md:block text-[9px] md:text-[10px] font-bold uppercase tracking-widest group-hover:text-lime-accent truncate max-w-[100px] md:max-w-none">User: {profile.displayName}</span>
            </button>
            <button onClick={onLogout} className="p-2 text-white/40 hover:text-red-500 transition-colors">
              <LogOut className="w-4 h-4 md:w-[18px] md:h-[18px]" />
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2 md:gap-6 mb-8 md:mb-12">
          <div className="bento-card p-2 md:p-6">
            <div className="text-[7px] md:text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1 md:mb-4 truncate">Matches</div>
            <div className="text-lg md:text-4xl font-bold text-lime-accent">{displayConferences.length}</div>
          </div>
          <div className="bento-card p-2 md:p-6">
            <div className="text-[7px] md:text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1 md:mb-4 truncate">Reviews</div>
            <div className="text-lg md:text-4xl font-bold text-lime-accent">{profile.aiReviewCount}</div>
          </div>
          <div className="bento-card p-2 md:p-6">
            <div className="text-[7px] md:text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1 md:mb-4 truncate">Deadlines</div>
            <div className="text-lg md:text-4xl font-bold text-lime-accent">
              {conferences.filter(c => {
                const deadlineDate = new Date(c.grantDeadline);
                const now = new Date();
                const diffTime = deadlineDate.getTime() - now.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays > 0 && diffDays <= 30;
              }).length}
            </div>
          </div>
          <div className="bento-card p-2 md:p-6 bg-lime-accent/5 border-lime-accent/20">
            <div className="text-[7px] md:text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1 md:mb-4 truncate">Status</div>
            <div className="text-[10px] md:text-xl font-bold text-lime-accent">{profile.isPremium ? 'verified Pro' : (profile.isVerified ? 'Verified' : 'Pending')}</div>
          </div>
        </div>

        {/* Pro Personalized Recommendations */}
        {profile.isPremium && recommendedConferences.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-lime-accent/10 rounded-full flex items-center justify-center text-lime-accent">
                <Sparkles size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Personalized Recommendations</h2>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Based on your interests and goals</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recommendedConferences.map(conf => (
                <div 
                  key={conf.id} 
                  onClick={() => onViewDetails(conf)}
                  className="bento-card group cursor-pointer border-lime-accent/20 hover:border-lime-accent transition-all relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-3">
                    <div className="w-6 h-6 bg-lime-accent/10 rounded-full flex items-center justify-center text-lime-accent">
                      <Zap size={12} />
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-lime-accent mb-1">{conf.field}</div>
                    <h3 className="text-sm font-bold tracking-tight group-hover:text-lime-accent transition-colors line-clamp-1">{conf.name}</h3>
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest opacity-40">
                      <Calendar size={12} />
                      {new Date(conf.grantDeadline).toLocaleDateString()}
                    </div>
                    <ChevronRight size={14} className="text-lime-accent opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pro Premium Alerts: Best 5 Grants This Week */}
        {profile.isPremium && premiumAlerts.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-lime-accent/10 rounded-full flex items-center justify-center text-lime-accent">
                <Bell size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Premium Alerts: Best 5 Grants This Week</h2>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Curated high-value opportunities with upcoming deadlines</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {premiumAlerts.map(conf => (
                <div 
                  key={conf.id} 
                  onClick={() => onViewDetails(conf)}
                  className="bento-card p-4 group cursor-pointer border-lime-accent/10 hover:border-lime-accent/40 transition-all"
                >
                  <div className="text-[8px] font-bold uppercase tracking-widest text-lime-accent mb-2">{conf.field}</div>
                  <h3 className="text-[11px] font-bold tracking-tight mb-3 line-clamp-2 leading-tight">{conf.name}</h3>
                  <div className="flex items-center justify-between mt-auto">
                    <div className="text-[8px] font-bold uppercase tracking-widest opacity-30">
                      {Math.ceil((new Date(conf.grantDeadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))}d left
                    </div>
                    <div className="flex gap-1">
                      {conf.grantCoverage?.flight && <Plane size={8} className="text-lime-accent/40" />}
                      {conf.grantCoverage?.hotel && <Hotel size={8} className="text-lime-accent/40" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="space-y-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-row items-center gap-2 md:gap-6 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
              <div className="flex bg-space-card border border-space-border p-1 rounded-xl shrink-0">
                <button 
                  onClick={() => setActiveTab('all')}
                  className={`px-3 md:px-6 py-2 rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'all' ? 'bg-lime-accent text-space-bg shadow-lg' : 'text-white/40 hover:text-white'}`}
                >
                  All Grants
                </button>
                <button 
                  onClick={() => setActiveTab('saved')}
                  className={`px-3 md:px-6 py-2 rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'saved' ? 'bg-lime-accent text-space-bg shadow-lg' : 'text-white/40 hover:text-white'}`}
                >
                  Saved ({profile.savedConferences?.length || 0})
                </button>
              </div>
              <div className="relative flex-1 min-w-[150px] md:min-w-[256px]">
                <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-white/20 w-3 h-3 md:w-4 md:h-4" />
                <input 
                  type="text" 
                  placeholder="Search..."
                  className="w-full bg-space-card border border-space-border rounded-xl py-2 md:py-3 pl-8 md:pl-12 pr-4 focus:border-lime-accent outline-none transition-all text-[9px] md:text-xs"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchTerm) {
                      onRealTimeSearch(searchTerm);
                    }
                  }}
                />
              </div>
              <button 
                onClick={() => onRealTimeSearch(searchTerm)}
                disabled={isLoading}
                className="shrink-0 px-4 md:px-6 py-2 md:py-3 bg-lime-accent text-space-bg rounded-xl text-[9px] md:text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? <Loader2 className="animate-spin" size={12} /> : <Sparkles size={12} />}
                <span className="hidden sm:inline">{isLoading ? 'Searching...' : 'AI Scout'}</span>
                <span className="sm:hidden">{isLoading ? '...' : 'Scout'}</span>
              </button>
            </div>

            {/* Filters Row */}
            <div className="flex flex-row items-center gap-3 p-3 md:p-4 bg-space-card/50 border border-space-border rounded-2xl backdrop-blur-sm overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-2 shrink-0 border-r border-white/10 pr-3">
                <Filter size={12} className="text-lime-accent" />
                <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest opacity-40">Filters</span>
              </div>
              
              <div className="flex flex-row gap-2 md:gap-4 flex-1">
                <select 
                  className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg px-3 py-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-widest outline-none focus:border-lime-accent transition-all cursor-pointer appearance-none min-w-[80px] md:min-w-[120px]"
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value as any)}
                >
                  <option key="all" value="All">Region: All</option>
                  {Object.values(Region).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                
                <select 
                  className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg px-3 py-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-widest outline-none focus:border-lime-accent transition-all cursor-pointer appearance-none min-w-[80px] md:min-w-[120px]"
                  value={selectedLocationType}
                  onChange={(e) => setSelectedLocationType(e.target.value as any)}
                >
                  <option key="all" value="All">Type: All</option>
                  {Object.values(LocationType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                
                <select 
                  className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg px-3 py-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-widest outline-none focus:border-lime-accent transition-all cursor-pointer appearance-none min-w-[80px] md:min-w-[120px]"
                  value={selectedFundingType}
                  onChange={(e) => setSelectedFundingType(e.target.value as any)}
                >
                  <option key="all" value="All">Funding: All</option>
                  {Object.values(FundingType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                
                <select 
                  className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg px-3 py-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-widest outline-none focus:border-lime-accent transition-all cursor-pointer appearance-none min-w-[80px] md:min-w-[120px]"
                  value={selectedDeadline}
                  onChange={(e) => setSelectedDeadline(e.target.value as any)}
                >
                  <option key="all" value="All">Deadline: All</option>
                  <option key="urgent" value="Urgent">Urgent (&lt; 30d)</option>
                  <option key="upcoming" value="Upcoming">Upcoming (&gt; 30d)</option>
                </select>
                
                <select 
                  className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg px-3 py-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-widest outline-none focus:border-lime-accent transition-all cursor-pointer appearance-none min-w-[80px] md:min-w-[120px]"
                  value={selectedField}
                  onChange={(e) => setSelectedField(e.target.value)}
                >
                  <option key="all" value="All">Field: All</option>
                  {uniqueFields.filter(f => f !== 'All').map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                
                <select 
                  className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg px-3 py-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-widest outline-none focus:border-lime-accent transition-all cursor-pointer appearance-none min-w-[80px] md:min-w-[120px]"
                  value={selectedCoverage}
                  onChange={(e) => setSelectedCoverage(e.target.value as any)}
                >
                  <option key="all" value="All">Coverage: All</option>
                  <option key="ticket" value="Ticket">Ticket Only</option>
                  <option key="flight" value="Flight">Flight Included</option>
                  <option key="hotel" value="Hotel">Hotel Included</option>
                  <option key="stipend" value="Stipend Included">Stipend Included</option>
                </select>
              </div>
              
              {(selectedRegion !== 'All' || selectedLocationType !== 'All' || selectedFundingType !== 'All' || selectedDeadline !== 'All' || selectedField !== 'All' || selectedCoverage !== 'All') && (
                <button 
                  onClick={() => {
                    setSelectedRegion('All');
                    setSelectedLocationType('All');
                    setSelectedFundingType('All');
                    setSelectedDeadline('All');
                    setSelectedField('All');
                    setSelectedCoverage('All');
                  }}
                  className="shrink-0 text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
            {paginatedConferences.map((conf) => (
              <motion.div 
                key={conf.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bento-card group hover:border-lime-accent/40 transition-all duration-500 !p-3 md:!p-6"
              >
                <div className="relative h-28 md:h-48 rounded-xl overflow-hidden mb-3 md:mb-6 bg-gradient-to-br from-space-card via-space-border to-lime-accent/5 flex items-center justify-center group-hover:to-lime-accent/10 transition-all duration-500">
                  <div className="text-4xl md:text-8xl font-black text-white/5 select-none group-hover:scale-110 transition-transform duration-1000">{conf.name.charAt(0)}</div>
                  {conf.imageUrl && (
                    <img 
                      src={conf.imageUrl} 
                      alt={conf.name} 
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" 
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${conf.id}/800/450`;
                      }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-space-card to-transparent"></div>
                  <div className="absolute top-2 left-2 md:top-4 md:left-4 flex gap-2">
                    {profile.applications?.find(app => app.conferenceId === conf.id) && (
                      <div className={`px-2 py-1 rounded-lg backdrop-blur-md border border-white/10 text-[8px] font-bold uppercase tracking-widest ${
                        profile.applications?.find(app => app.conferenceId === conf.id)?.status === ApplicationStatus.ACCEPTED ? 'bg-lime-accent text-space-bg' :
                        profile.applications?.find(app => app.conferenceId === conf.id)?.status === ApplicationStatus.REJECTED ? 'bg-red-500 text-white' :
                        'bg-blue-500 text-white'
                      }`}>
                        {profile.applications?.find(app => app.conferenceId === conf.id)?.status}
                      </div>
                    )}
                  </div>
                  <div className="absolute top-2 right-2 md:top-4 md:right-4 flex gap-2">
                    <button 
                      onClick={() => onSaveConference(conf.id)}
                      className={`p-1.5 md:p-2 rounded-lg backdrop-blur-md border border-white/10 transition-all ${profile.savedConferences?.includes(conf.id) ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-red-500/20'}`}
                    >
                      <Heart size={12} className="md:w-3.5 md:h-3.5" fill={profile.savedConferences?.includes(conf.id) ? "currentColor" : "none"} />
                    </button>
                  </div>
                  <div className="absolute bottom-2 left-2 md:bottom-4 md:left-4">
                    <div className="flex items-center gap-2 mb-0.5 md:mb-1">
                      <div className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest text-lime-accent">{conf.field}</div>
                    </div>
                    <h3 className="text-xs md:text-lg font-bold tracking-tight line-clamp-1">{conf.name}</h3>
                  </div>
                </div>
                <div className="space-y-2 md:space-y-4">
                  <div className="flex items-center gap-2 text-white/40 text-[8px] md:text-[10px] font-bold uppercase tracking-widest truncate">
                    <MapPin size={10} className="md:w-3 md:h-3" /> {conf.location}
                  </div>
                  <div className="flex items-center gap-2 text-white/40 text-[8px] md:text-[10px] font-bold uppercase tracking-widest truncate">
                    <Calendar size={10} className="md:w-3 md:h-3" /> {new Date(conf.startDate).toLocaleDateString()}
                  </div>
                  <div className="flex flex-wrap gap-1.5 md:gap-2 pt-1 md:pt-2">
                    {conf.grantCoverage?.ticket && (
                      <div className="p-1 md:p-1.5 bg-white/5 rounded-lg text-white/40 hover:text-lime-accent transition-colors" title="Ticket Included">
                        <Ticket size={10} className="md:w-3 md:h-3" />
                      </div>
                    )}
                    {conf.grantCoverage?.flight && (
                      <div className="p-1 md:p-1.5 bg-white/5 rounded-lg text-white/40 hover:text-lime-accent transition-colors" title="Flight Included">
                        <Plane size={10} className="md:w-3 md:h-3" />
                      </div>
                    )}
                    {conf.grantCoverage?.hotel && (
                      <div className="p-1 md:p-1.5 bg-white/5 rounded-lg text-white/40 hover:text-lime-accent transition-colors" title="Hotel Included">
                        <Hotel size={10} className="md:w-3 md:h-3" />
                      </div>
                    )}
                    {conf.grantCoverage?.stipend && (
                      <div className="p-1 md:p-1.5 bg-white/5 rounded-lg text-white/40 hover:text-lime-accent transition-colors" title="Stipend Included">
                        <Zap size={10} className="md:w-3 md:h-3" />
                      </div>
                    )}
                  </div>
                  <div className="pt-2 md:pt-4 flex gap-2 md:gap-3">
                    <button 
                      onClick={() => onViewDetails(conf)}
                      className="flex-1 bg-white text-space-bg py-1.5 md:py-3 rounded-xl text-[8px] md:text-[10px] font-bold uppercase tracking-widest hover:bg-lime-accent transition-all"
                    >
                      Details
                    </button>
                    <button 
                      onClick={() => onOpenAI(conf)}
                      className="p-2 md:p-3 bg-space-card border border-space-border rounded-xl text-lime-accent hover:border-lime-accent transition-all"
                    >
                      <Sparkles size={12} className="md:w-4 md:h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {visibleCount < displayConferences.length && (
            <div className="flex justify-center pt-12">
              <button 
                onClick={() => setVisibleCount(prev => prev + 6)}
                className="px-12 py-4 border border-white/10 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-white/5 transition-all flex items-center gap-2"
              >
                <Plus size={16} /> See More Available Grants
              </button>
            </div>
          )}

          {displayConferences.length === 0 && (
            <div className="text-center py-24 bento-card border-dashed">
              <p className="text-white/20 font-bold uppercase tracking-widest">No grants found in this sector.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function VerifyEmailView({ user, onVerified, onLogout }: { user: FirebaseUser, onVerified: () => void, onLogout: () => void }) {
  const [isResending, setIsResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      await user.reload();
      if (user.emailVerified) {
        onVerified();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [user, onVerified]);

  const handleResend = async () => {
    setIsResending(true);
    try {
      await sendEmailVerification(user);
      setMessage("Verification email sent! Please check your inbox.");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-space-bg flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-lime-accent/5 rounded-full blur-[120px]"></div>
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bento-card max-w-md w-full relative z-10 text-center"
      >
        <div className="w-20 h-20 bg-lime-accent/10 rounded-full flex items-center justify-center mx-auto mb-8">
          <Bell className="text-lime-accent" size={40} />
        </div>
        
        <h2 className="text-3xl font-bold tracking-tighter uppercase mb-4">Verify Identity</h2>
        <p className="text-white/60 text-sm mb-8 leading-relaxed">
          A verification link has been sent to <span className="text-lime-accent font-bold">{user.email}</span>. 
          Please verify your email to access the GrantPrix Profile.
        </p>

        {message && (
          <div className="bg-lime-accent/10 border border-lime-accent/20 text-lime-accent p-4 rounded-xl text-xs font-bold uppercase tracking-widest mb-6 text-center">
            {message}
          </div>
        )}

        <div className="space-y-4">
          <button 
            onClick={handleResend}
            disabled={isResending}
            className="btn-lime w-full flex items-center justify-center gap-2"
          >
            {isResending ? <Loader2 className="animate-spin" /> : 'Resend Verification Email'}
          </button>
          
          <button 
            onClick={onLogout}
            className="w-full py-4 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors"
          >
            Switch Account / Logout
          </button>
        </div>

        <div className="mt-10 flex items-center justify-center gap-3">
          <div className="w-2 h-2 bg-lime-accent rounded-full animate-pulse"></div>
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Awaiting Verification Signal...</span>
        </div>
      </motion.div>
    </div>
  );
}

function ReviewForm({ onSubmit, onCancel }: { onSubmit: (rating: number, comment: string) => void, onCancel: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  return (
    <div className="p-6 bg-white/5 rounded-[24px] border border-white/10 space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-lime-accent">Write a Review</h3>
        <button onClick={onCancel} className="text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100">Cancel</button>
      </div>
      
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button 
            key={star} 
            onClick={() => setRating(star)}
            className={`transition-all ${rating >= star ? 'text-lime-accent scale-110' : 'text-white/10'}`}
          >
            <Award size={24} />
          </button>
        ))}
      </div>

      <textarea 
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share your experience with this grant..."
        className="w-full bg-space-bg border border-space-border rounded-xl p-4 text-xs min-h-[100px] outline-none focus:border-lime-accent transition-all resize-none"
      />

      <button 
        onClick={() => {
          if (comment.trim()) {
            onSubmit(rating, comment);
            setComment('');
          }
        }}
        disabled={!comment.trim()}
        className="w-full py-3 bg-lime-accent text-space-bg rounded-xl font-bold text-[10px] uppercase tracking-widest hover:scale-[1.02] transition-all disabled:opacity-50"
      >
        Submit Review
      </button>
    </div>
  );
}

const STATUS_CACHE_KEY = 'grantpath_status_cache';

const getCachedStatus = (id: string) => {
  try {
    const cache = JSON.parse(localStorage.getItem(STATUS_CACHE_KEY) || '{}');
    const entry = cache[id];
    if (entry && (Date.now() - entry.timestamp < 1000 * 60 * 60 * 24)) { // 24h cache
      return entry.data;
    }
  } catch (e) {
    console.error('Cache error:', e);
  }
  return null;
};

const setCachedStatus = (id: string, data: any) => {
  try {
    const cache = JSON.parse(localStorage.getItem(STATUS_CACHE_KEY) || '{}');
    cache[id] = { data, timestamp: Date.now() };
    localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error('Cache error:', e);
  }
};

function GrantDetailsView({ grant, onBack, onOpenAI, isPremium, onUpdateApplication, userApplication, userProfile }: { 
  grant: Conference, 
  onBack: () => void, 
  onOpenAI: (conf: Conference) => void,
  isPremium: boolean,
  onUpdateApplication?: (confId: string, status: ApplicationStatus, notes?: string) => void,
  userApplication?: UserApplication,
  userProfile?: UserProfile | null
}) {
  const [liveStatus, setLiveStatus] = useState<{ isOpen: boolean, statusMessage: string, lastVerified: string } | null>(() => getCachedStatus(grant.id));
  const [isVerifying, setIsVerifying] = useState(false);
  
  // AI Assistant State
  const [aiTask, setAiTask] = useState<'improve' | 'suggest' | 'tailor' | null>(null);
  const [aiInput, setAiInput] = useState('');
  const [aiOutput, setAiOutput] = useState<{ output: string, explanation: string, tips: string[] } | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const handleAiAssist = async () => {
    if (!aiTask || !userProfile) return;
    setIsAiLoading(true);
    try {
      const result = await assistApplication(aiTask, aiInput, grant, userProfile);
      setAiOutput(result);
    } catch (error) {
      toast.error('Failed to get AI assistance. Please try again.');
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    const cached = getCachedStatus(grant.id);
    if (cached) {
      setLiveStatus(cached);
      // Still verify in background if it's older than 1 hour
      const cache = JSON.parse(localStorage.getItem(STATUS_CACHE_KEY) || '{}');
      if (Date.now() - cache[grant.id].timestamp > 1000 * 60 * 60) {
        handleVerifyStatus(true);
      }
    } else {
      handleVerifyStatus();
    }
  }, [grant.id]);

  const handleVerifyStatus = async (isBackground = false) => {
    if (!isBackground) setIsVerifying(true);
    const result = await verifyGrantStatus(grant.name, grant.applicationUrl);
    if (result) {
      setLiveStatus(result);
      setCachedStatus(grant.id, result);
    }
    if (!isBackground) setIsVerifying(false);
  };

  const isDeadlinePassed = new Date(grant.grantDeadline).getTime() < new Date().getTime();

  const currentStatus = useMemo(() => {
    const staticStatus = getGrantStatus(grant);
    
    // If we have live status, it's the ultimate confirmation
    if (liveStatus) {
      if (liveStatus.isOpen) return 'open';
      
      // If live status says closed, check if it's "coming soon" based on 4-month rule
      const deadlineDate = new Date(grant.grantDeadline);
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
      
      if (deadlineDate < fourMonthsAgo) {
        return 'coming-soon';
      }
      return 'closed';
    }

    // If static status is open but not yet confirmed by live check (for new/unverified results)
    if (staticStatus === 'open') {
      return 'verifying';
    }

    return staticStatus;
  }, [grant, liveStatus]);

  return (
    <div className="min-h-screen bg-space-bg">
      {/* Full Width Hero Header */}
      <div className="relative h-[40vh] md:h-[50vh] w-full overflow-hidden">
        {grant.imageUrl ? (
          <img 
            src={grant.imageUrl} 
            alt={grant.name} 
            className="absolute inset-0 w-full h-full object-cover" 
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${grant.id}/1920/1080`;
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-space-card via-space-border to-lime-accent/20 flex items-center justify-center">
            <div className="text-[20vw] font-black text-white/5 select-none">{grant.name.charAt(0)}</div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-space-bg via-space-bg/40 to-transparent"></div>
        
        <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-12 max-w-7xl mx-auto w-full">
          <motion.button 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={onBack}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/60 hover:text-lime-accent transition-all mb-8 group w-fit"
          >
            <ChevronRight size={14} className="rotate-180 group-hover:-translate-x-1 transition-transform" /> 
            Back to Dashboard
          </motion.button>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-3 py-1 bg-lime-accent text-space-bg rounded-full text-[10px] font-bold uppercase tracking-widest">
                {grant.field}
              </span>
              <span className="px-3 py-1 bg-white/10 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest">
                {grant.fundingType}
              </span>
              {currentStatus === 'open' && (
                <span className="px-3 py-1 bg-green-500/20 border border-green-500/30 text-green-400 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                  Applications Open
                </span>
              )}
            </div>
            <h1 className="text-4xl md:text-7xl font-bold tracking-tighter uppercase leading-none">{grant.name}</h1>
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Main Content Column */}
          <div className="lg:col-span-8 space-y-16">
            {/* Description & Core Info */}
            <section className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-lime-accent">Overview</h3>
                <p className="text-lg md:text-xl text-white/80 leading-relaxed font-light">
                  {grant.description || "No detailed description available for this grant. Please check the official website for more information."}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-10 border-y border-white/5">
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-30">Location</div>
                  <div className="text-sm font-bold flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-lime-accent" /> {grant.location}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-30">Conf Dates</div>
                  <div className="text-sm font-bold flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-lime-accent" /> {new Date(grant.startDate).toLocaleDateString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-30">Region</div>
                  <div className="text-sm font-bold flex items-center gap-2">
                    <Globe className="w-4 h-4 text-lime-accent" /> {grant.region}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-30">Format</div>
                  <div className="text-sm font-bold flex items-center gap-2">
                    <Target className="w-4 h-4 text-lime-accent" /> {grant.locationType}
                  </div>
                </div>
              </div>
            </section>

            {/* Coverage & Tags */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-lime-accent">Grant Coverage</h3>
                <div className="flex flex-wrap gap-3">
                  {grant.grantCoverage?.flight && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-white/60">
                      <Plane size={14} className="text-lime-accent" /> Flight
                    </div>
                  )}
                  {grant.grantCoverage?.hotel && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-white/60">
                      <Hotel size={14} className="text-lime-accent" /> Hotel
                    </div>
                  )}
                  {grant.grantCoverage?.ticket && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-white/60">
                      <Ticket size={14} className="text-lime-accent" /> Ticket
                    </div>
                  )}
                  {grant.grantCoverage?.stipend && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-white/60">
                      <Zap size={14} className="text-lime-accent" /> Stipend
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-lime-accent">Focus Areas</h3>
                <div className="flex flex-wrap gap-2">
                  {grant.tags?.map(tag => (
                    <span key={tag} className="px-4 py-2 bg-lime-accent/5 border border-lime-accent/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-lime-accent/60">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {/* Eligibility */}
            <section className="space-y-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-lime-accent">Eligibility Criteria</h3>
              <div className="text-base text-white/70 leading-relaxed max-w-3xl">
                {grant.eligibility || "This grant is primarily aimed at underrepresented technologists, including but not limited to women, people of color, and LGBTQ+ individuals in the tech industry. Specific technical background in the conference field is usually required."}
              </div>
            </section>

            {/* Pro Content */}
            {isPremium && (
              <section className="space-y-12 pt-12 border-t border-white/5">
                {/* Insider Insights */}
                <div className="bg-gradient-to-br from-lime-accent/10 via-transparent to-transparent border border-lime-accent/20 rounded-[40px] p-8 md:p-12">
                  <div className="flex items-center gap-4 mb-10">
                    <div className="w-12 h-12 bg-lime-accent/20 rounded-2xl flex items-center justify-center text-lime-accent">
                      <ShieldCheck size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight">Insider Intelligence</h3>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-lime-accent/60">Verified Pro Analysis</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-4">
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-white/40">Success Strategy</h4>
                      <p className="text-sm text-white/70 leading-relaxed italic border-l-2 border-lime-accent/30 pl-6">
                        "Based on previous winners, this committee prioritizes applicants who demonstrate a clear plan for knowledge sharing (e.g., a blog post, workshop, or community talk) after the conference."
                      </p>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-white/40">Application Nuance</h4>
                      <p className="text-sm text-white/70 leading-relaxed italic border-l-2 border-lime-accent/30 pl-6">
                        "The 'Personal Statement' section is weighted heavily (approx. 40% of score). Focus on your 'Why' rather than just your technical 'What'."
                      </p>
                    </div>
                  </div>
                </div>

                {/* AI Assistant */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-lime-accent">
                      <Sparkles size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight">AI Application Assistant</h3>
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Pro Feature: Real-time application drafting</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { id: 'improve', label: 'Improve Essay', icon: <FileText size={18} /> },
                      { id: 'suggest', label: 'Suggest Answer', icon: <MessageSquare size={18} /> },
                      { id: 'tailor', label: 'Tailor Response', icon: <Target size={18} /> }
                    ].map(task => (
                      <button 
                        key={task.id}
                        onClick={() => { setAiTask(task.id as any); setAiOutput(null); }}
                        className={`p-6 rounded-3xl border transition-all text-left space-y-3 ${aiTask === task.id ? 'bg-lime-accent/10 border-lime-accent/40' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                      >
                        <div className="text-lime-accent">{task.icon}</div>
                        <div className="text-[10px] font-bold uppercase tracking-widest">{task.label}</div>
                      </button>
                    ))}
                  </div>

                  <AnimatePresence>
                    {aiTask && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="space-y-4"
                      >
                        <textarea 
                          value={aiInput}
                          onChange={(e) => setAiInput(e.target.value)}
                          placeholder={aiTask === 'suggest' ? "Enter the application question here..." : "Paste your text here..."}
                          className="w-full h-40 bg-white/5 border border-white/10 rounded-[32px] p-6 text-sm focus:outline-none focus:border-lime-accent/40 transition-colors resize-none"
                        />
                        <button 
                          onClick={handleAiAssist}
                          disabled={isAiLoading || !aiInput.trim()}
                          className="btn-lime w-full flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {isAiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                          {isAiLoading ? 'Analyzing...' : 'Generate Assistance'}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {aiOutput && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-8 bg-lime-accent/5 border border-lime-accent/10 rounded-[40px] space-y-8"
                    >
                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-lime-accent mb-4">AI Suggestion</h4>
                        <div className="text-base text-white/80 leading-relaxed whitespace-pre-wrap font-light">
                          {aiOutput.output}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-8 border-t border-lime-accent/10">
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-lime-accent/60">Strategy Used</h4>
                          <p className="text-xs text-white/60 leading-relaxed italic">{aiOutput.explanation}</p>
                        </div>
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-lime-accent/60">Pro Tips</h4>
                          <ul className="space-y-2">
                            {aiOutput.tips.map((tip, i) => (
                              <li key={i} className="text-xs text-white/60 flex items-start gap-3">
                                <span className="text-lime-accent mt-1">•</span> {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar Action Column */}
          <div className="lg:col-span-4 space-y-8">
            <div className="sticky top-12 space-y-8">
              {/* Status Card */}
              <div className="bg-white/5 border border-white/10 rounded-[40px] p-8 space-y-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Application Deadline</h4>
                    <div className={`flex items-center gap-3 ${currentStatus === 'open' || currentStatus === 'verifying' ? 'text-lime-accent' : 'text-white/20'}`}>
                      <Clock size={24} />
                      <span className="text-2xl font-bold tracking-tight uppercase">
                        {currentStatus === 'open' || currentStatus === 'verifying'
                          ? new Date(grant.grantDeadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                          : 'To Be Announced'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Current Status</h4>
                    <div className={`flex items-center gap-3 ${
                      currentStatus === 'open' ? 'text-lime-accent' : 
                      currentStatus === 'verifying' ? 'text-lime-accent/50' :
                      currentStatus === 'coming-soon' ? 'text-yellow-500' : 'text-red-500'
                    }`}>
                      {currentStatus === 'open' ? <CheckCircle2 size={24} /> : 
                       currentStatus === 'verifying' ? <Loader2 size={24} className="animate-spin" /> :
                       currentStatus === 'coming-soon' ? <Clock size={24} /> : <X size={24} />}
                      <span className="text-2xl font-bold tracking-tight uppercase">
                        {currentStatus === 'open' ? 'Open' : 
                         currentStatus === 'verifying' ? 'Verifying' :
                         currentStatus === 'coming-soon' ? 'Coming Soon' : 'Closed'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-8 border-t border-white/5">
                  {currentStatus === 'open' ? (
                    <a 
                      href={grant.applicationUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={() => onUpdateApplication?.(grant.id, ApplicationStatus.APPLIED)}
                      className="btn-lime w-full flex items-center justify-center gap-2 py-6"
                    >
                      Apply Now <ExternalLink size={16} />
                    </a>
                  ) : (
                    <button 
                      disabled
                      className="w-full bg-white/5 border border-white/10 text-white/20 py-6 rounded-[24px] font-bold text-xs uppercase tracking-widest cursor-not-allowed"
                    >
                      Applications Closed
                    </button>
                  )}
                  
                  <button 
                    onClick={() => {
                      if (!userApplication || userApplication.status === ApplicationStatus.BOOKMARKED) {
                        onUpdateApplication?.(grant.id, ApplicationStatus.IN_PROGRESS);
                      }
                      onOpenAI(grant);
                    }}
                    className="w-full p-6 bg-white/5 border border-white/10 rounded-[24px] text-white/60 hover:text-lime-accent hover:border-lime-accent/40 transition-all flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-widest"
                  >
                    <Sparkles size={18} /> AI Grant Advice
                  </button>
                </div>
              </div>

              {/* Live Verification Card */}
              <div className="bg-lime-accent/5 border border-lime-accent/10 rounded-[40px] p-8 space-y-6">
                <div className="flex items-center gap-3 text-lime-accent">
                  <Activity size={20} />
                  <h3 className="text-xs font-bold uppercase tracking-widest">Live Verification</h3>
                </div>
                <p className="text-[10px] text-white/40 uppercase tracking-widest leading-relaxed">
                  Real-time neural search to verify if the grant is currently active on the official website.
                </p>
                
                {liveStatus && (
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${liveStatus.isOpen ? 'bg-lime-accent animate-pulse' : 'bg-red-500'}`}></div>
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        {liveStatus.isOpen ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/60 leading-relaxed italic">
                      {liveStatus.statusMessage}
                    </p>
                  </div>
                )}

                <button 
                  onClick={() => handleVerifyStatus()}
                  disabled={isVerifying}
                  className="w-full py-4 bg-lime-accent/10 border border-lime-accent/20 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-lime-accent hover:bg-lime-accent/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isVerifying ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                  {isVerifying ? 'Verifying...' : 'Refresh Status'}
                </button>
              </div>

              {/* System Note */}
              <div className="px-8 py-4 opacity-40">
                <p className="text-[9px] leading-relaxed uppercase tracking-widest text-center">
                  Always verify grant details on the official provider's website. GrantPrix provides intelligence but the final application process is governed by the provider.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
