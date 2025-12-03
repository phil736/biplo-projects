import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, collection, query, orderBy, onSnapshot, setDoc, addDoc, getDoc, updateDoc } from 'firebase/firestore';
import { setLogLevel } from 'firebase/firestore';
import { Mail, Calendar, User, Lock, Send, X, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

// --- CONFIGURATION AND INITIALIZATION ---
setLogLevel('debug'); // Enable detailed logging for debugging

// Global variables provided by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-drankenbayart-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase
const app = Object.keys(firebaseConfig).length ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;

// Firestore Collection Paths
const getEventsCollectionRef = () => collection(db, `artifacts/${appId}/public/data/events`);
const getRegistrationsCollectionRef = (eventId) => collection(db, `artifacts/${appId}/public/data/events/${eventId}/registrations`);

// --- UTILITY COMPONENTS ---

const Card = ({ children, className = '' }) => (
    <div className={`bg-white p-6 rounded-xl shadow-xl transition-all duration-300 border border-gray-100 ${className}`}>
        {children}
    </div>
);

// Fix 1: forward native button props (type, etc.) so forms submit correctly
const Button = ({ children, onClick, disabled = false, className = '', type = 'button', ...props }) => (
    <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={`w-full py-3 px-4 rounded-xl font-semibold transition duration-200 
            ${disabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transform hover:scale-[1.01]'} 
            ${className}`}
        {...props}
    >
        {children}
    </button>
);

const Input = ({ label, icon: Icon, type = 'text', value, onChange, placeholder = '' }) => (
    <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div className="relative">
            {Icon && <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />}
            <input
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                required
                className={`w-full p-3 pl-${Icon ? '10' : '4'} border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 transition duration-150`}
            />
        </div>
    </div>
);

// Fix 2: support 'info' variant (used for loading / no events)
const Message = ({ type = 'error', title, children }) => {
    const icon = type === 'success' ? <CheckCircle className="w-5 h-5 mr-3 text-green-700" />
        : type === 'info' ? <Clock className="w-5 h-5 mr-3 text-indigo-700" />
        : <AlertTriangle className="w-5 h-5 mr-3 text-red-700" />;

    const bgColor = type === 'success' ? 'bg-green-100 border-green-400' : type === 'info' ? 'bg-indigo-100 border-indigo-400' : 'bg-red-100 border-red-400';
    const textColor = type === 'success' ? 'text-green-800' : type === 'info' ? 'text-indigo-800' : 'text-red-800';

    return (
        <div className={`p-4 rounded-xl border-l-4 ${bgColor} mb-4 flex items-start`}>
            {icon}
            <div>
                <p className={`font-semibold ${textColor}`}>{title}</p>
                {children && <p className={`text-sm mt-1 ${textColor}`}>{children}</p>}
            </div>
        </div>
    );
};

// --- AUTHENTICATION COMPONENTS ---

const AdminLogin = ({ isAdmin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [isRegistering, setIsRegistering] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        if (!auth) return;

        try {
            if (isRegistering) {
                // Allows Charles to register an account
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                // Allows Charles to log in
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };

    if (isAdmin) {
        return (
            <Card className="max-w-md mx-auto mb-8">
                <p className="text-center text-lg font-semibold text-indigo-700 mb-4">Admin Access</p>
                <Button onClick={() => signOut(auth)} className="bg-red-600 hover:bg-red-700">
                    <Lock className="inline-block w-5 h-5 mr-2" />
                    Logout
                </Button>
            </Card>
        );
    }

    return (
        <Card className="max-w-md mx-auto mb-8">
            <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">{isRegistering ? 'Admin Registration' : 'Admin Login'}</h2>
            <form onSubmit={handleSubmit}>
                {error && <Message type="error" title="Login Error">{error}</Message>}
                <Input
                    label="Email"
                    icon={Mail}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="charles@drankenbayart.com"
                />
                <Input
                    label="Password"
                    icon={Lock}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <Button type="submit" className="mt-4">
                    {isRegistering ? 'Register as Admin' : 'Login'}
                </Button>
            </form>
            <button
                className="mt-4 w-full text-sm text-indigo-600 hover:text-indigo-800 transition duration-150"
                onClick={() => setIsRegistering(!isRegistering)}
            >
                {isRegistering ? 'Already registered? Go to Login' : 'First time? Register here'}
            </button>
        </Card>
    );
};

// --- ADMIN FEATURES (EVENT CREATION) ---

const EventCreation = ({ currentUserId }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [photoUrl, setPhotoUrl] = useState(''); // Simple text input for photo URL
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(false);

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setDate('');
        setTime('');
        setPhotoUrl('');
    };

    const handleCreateEvent = async (e) => {
        e.preventDefault();
        setMessage(null);
        setLoading(true);

        if (!db) {
            setMessage({ type: 'error', title: 'Database Error', content: 'Database not initialized.' });
            setLoading(false);
            return;
        }

        const newEvent = {
            title,
            description,
            photoUrl: photoUrl || `https://placehold.co/600x400/818CF8/FFFFFF?text=Dranken+Bayart+Event`,
            date: date,
            time: time,
            timestamp: Date.now(),
            adminId: currentUserId,
            registrationsCount: 0,
        };

        try {
            await addDoc(getEventsCollectionRef(), newEvent);
            setMessage({ type: 'success', title: 'Event Created!', content: 'The new event is now visible on the public page.' });
            resetForm();
        } catch (err) {
            console.error("Error creating event:", err);
            setMessage({ type: 'error', title: 'Creation Failed', content: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl font-bold text-indigo-700 mb-6 border-b pb-3">Create New Event</h2>
            <form onSubmit={handleCreateEvent}>
                {message && <Message type={message.type} title={message.title}>{message.content}</Message>}
                <Input label="Title" icon={Calendar} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Beer Tasting 2026" />
                <Input label="Description" icon={null} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A brief description of the event." />
                <Input label="Date" icon={Calendar} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                <Input label="Starting Time" icon={Clock} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                <Input label="Photo URL (Optional)" icon={null} value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="e.g., https://example.com/photo.jpg" />
                <Button type="submit" disabled={loading || !title || !description || !date || !time}>
                    {loading ? 'Saving...' : 'Publish Event'}
                </Button>
            </form>
        </Card>
    );
};

// --- PUBLIC FEATURES (REGISTRATION) ---

const RegistrationForm = ({ eventId, eventTitle }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleRegister = async (e) => {
        e.preventDefault();
        setMessage(null);
        setLoading(true);

        if (!db) {
            setMessage({ type: 'error', title: 'Database Error', content: 'Database not initialized.' });
            setLoading(false);
            return;
        }

        const normalizedEmail = email.toLowerCase().trim();
        const registrationRef = doc(getRegistrationsCollectionRef(eventId), normalizedEmail);
        
        try {
            // 1. Check for Duplicate Registration
            const docSnap = await getDoc(registrationRef);
            if (docSnap.exists()) {
                setMessage({ type: 'error', title: 'Already Registered', content: `The email address ${email} is already registered for this event.` });
                setLoading(false);
                return;
            }

            // 2. Add New Registration
            await setDoc(registrationRef, {
                name: name.trim(),
                email: normalizedEmail,
                registeredAt: Date.now(),
            });

            // 3. Increment Registration Count on the Event Document
            const eventRef = doc(getEventsCollectionRef(), eventId);
            const eventSnap = await getDoc(eventRef);
            
            if (eventSnap.exists()) {
                const currentCount = eventSnap.data().registrationsCount || 0;
                await updateDoc(eventRef, {
                    registrationsCount: currentCount + 1
                });
            }

            // 4. Success Message and Email Simulation
            setMessage({ type: 'success', title: 'Registration Complete!', content: `Thank you, ${name}! A confirmation email has been sent to ${email} (simulated).` });
            setName('');
            setEmail('');

        } catch (err) {
            console.error("Error registering:", err);
            setMessage({ type: 'error', title: 'Registration Failed', content: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="mt-4">
            <h3 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Register for {eventTitle}</h3>
            <form onSubmit={handleRegister}>
                {message && <Message type={message.type} title={message.title}>{message.content}</Message>}
                <Input
                    label="Your Name"
                    icon={User}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                />
                <Input
                    label="Your Email"
                    icon={Mail}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                />
                <Button type="submit" disabled={loading || !name || !email}>
                    {loading ? 'Submitting...' : 'Register Now'}
                </Button>
            </form>
        </Card>
    );
};

const EventCard = ({ event }) => {
    const formattedDate = new Date(event.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return (
        <Card className="flex flex-col md:flex-row gap-6 mb-8 transform hover:shadow-2xl hover:-translate-y-1 transition duration-300">
            <div className="md:w-1/3 flex-shrink-0 rounded-xl overflow-hidden shadow-md">
                <img 
                    src={event.photoUrl} 
                    alt={event.title} 
                    className="w-full h-48 object-cover" 
                    onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/400x300/818CF8/FFFFFF?text=Image+Unavailable"; }}
                />
            </div>
            
            <div className="md:w-2/3">
                <h2 className="text-3xl font-extrabold text-gray-900 mb-2">{event.title}</h2>
                
                <div className="flex items-center text-indigo-600 font-semibold mb-4 text-lg">
                    <Calendar className="w-5 h-5 mr-2" />
                    <span className="mr-4">{formattedDate}</span>
                    <Clock className="w-5 h-5 mr-2" />
                    <span>{event.time}</span>
                </div>

                <p className="text-gray-600 mb-4">{event.description}</p>
                
                <div className="text-sm font-medium text-gray-500 mb-4">
                    <User className="inline w-4 h-4 mr-1 text-green-500" />
                    {event.registrationsCount} attendees so far.
                </div>
                
                <RegistrationForm eventId={event.id} eventTitle={event.title} />
            </div>
        </Card>
    );
};


const EventList = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db) return;

        // Use onSnapshot to listen for real-time changes
        const q = query(getEventsCollectionRef(), orderBy('date'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const eventsData = [];
            snapshot.forEach((doc) => {
                eventsData.push({ id: doc.id, ...doc.data() });
            });
            // Filter out past events
            const upcomingEvents = eventsData.filter(event => new Date(event.date) >= new Date(new Date().toDateString()));
            setEvents(upcomingEvents);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching events: ", error);
            setLoading(false);
        });

        return () => unsubscribe(); // Cleanup the listener
    }, [db]);

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6">
            <h1 className="text-4xl font-extrabold text-gray-900 mb-8 border-b pb-4">
                Upcoming Dranken Bayart Events
            </h1>
            
            {loading && (
                <Message type="info" title="Loading Events">Fetching event data in real-time...</Message>
            )}
            
            {!loading && events.length === 0 && (
                <Message type="info" title="No Upcoming Events">
                    Check back soon! Charles hasn't scheduled any events yet.
                </Message>
            )}

            <div className="space-y-8">
                {events.map(event => (
                    <EventCard key={event.id} event={event} />
                ))}
            </div>
        </div>
    );
};

// --- MAIN APP COMPONENT ---

const App = () => {
    const [authState, setAuthState] = useState({
        user: null,
        loading: true,
        isAdmin: false,
        userId: null
    });

    // 1. Authentication Listener (runs once on load)
    useEffect(() => {
        if (!auth) {
            console.error("Firebase Auth not initialized.");
            setAuthState(s => ({ ...s, loading: false }));
            return;
        }

        const handleAuth = async () => {
            if (initialAuthToken) {
                try {
                    // Use initial token for canvas environment authentication
                    await signInWithCustomToken(auth, initialAuthToken);
                } catch (error) {
                    console.error("Custom token sign-in failed, proceeding to anonymous sign-in.", error);
                    await signInAnonymously(auth);
                }
            } else {
                // Fallback for environments without a custom token
                await signInAnonymously(auth);
            }
        };

        handleAuth();

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            const isAdmin = user && !user.isAnonymous; // Admin is anyone who is NOT anonymous
            setAuthState({
                user: user,
                loading: false,
                isAdmin: isAdmin,
                userId: user?.uid || null,
            });
        });

        return () => unsubscribe();
    }, []);

    if (authState.loading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gray-50">
                <div className="text-lg text-indigo-600 font-semibold">
                    <svg className="animate-spin h-6 w-6 mr-3 inline-block" viewBox="0 0 24 24">...</svg>
                    Initializing Application...
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <header className="py-6 mb-8 text-center border-b border-indigo-200">
                <h1 className="text-5xl font-extrabold text-indigo-800">DRANKEN BAYART</h1>
                <p className="text-xl text-gray-600 mt-2">Event Management & Registration Portal</p>
                <p className="mt-4 text-xs text-gray-400">
                    User ID: {authState.userId || 'N/A (Anon)'} | App ID: {appId}
                </p>
            </header>

            {/* Admin Panel */}
            <AdminLogin isAdmin={authState.isAdmin} />

            {authState.isAdmin && (
                <div className="mb-12">
                    <EventCreation currentUserId={authState.userId} />
                    {/* Future enhancement: Admin can see list of all registrations per event */}
                </div>
            )}
            
            {/* Public Event Page */}
            <EventList />
        </div>
    );
};

export default App;
