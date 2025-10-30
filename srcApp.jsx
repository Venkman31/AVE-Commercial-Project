import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged, 
    signInWithCustomToken 
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc, 
    setDoc, 
    deleteDoc, 
    onSnapshot, 
    query, 
    where,
    setLogLevel
} from 'firebase/firestore';
import { 
    BarChart, 
    Bar, 
    LineChart, 
    Line, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    Legend, 
    ResponsiveContainer 
} from 'recharts';
import { 
    LayoutDashboard, 
    DollarSign, 
    Target, 
    Users, 
    Plus, 
    Edit2, 
    Trash2, 
    CheckSquare, 
    X, 
    Bell,
    FileText,
    Briefcase,
    ChevronDown
} from 'lucide-react';

// --- Firebase Configuration ---
// Read from Vercel/Vite Environment Variables (must be prefixed with VITE_)
const firebaseConfig = typeof import.meta.env.VITE_FIREBASE_CONFIG !== 'undefined' 
    ? JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG) 
    : { apiKey: "DEFAULT_API_KEY", authDomain: "DEFAULT_AUTH_DOMAIN", projectId: "DEFAULT_PROJECT_ID" };

const appId = import.meta.env.VITE_APP_ID || 'default-ave-tracker';
const initialAuthToken = import.meta.env.VITE_AUTH_TOKEN; // Will be undefined if not set

// --- Main Application Component ---
export default function App() {
    // --- State Management ---
    const [view, setView] = useState('dashboard'); // dashboard, income, budgets, partners
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // Data from Firestore
    const [incomeData, setIncomeData] = useState([]);
    const [budgetData, setBudgetData] = useState([]);
    const [partners, setPartners] = useState([]);

    // UI State
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null); // Can be income, budget, or partner
    const [modalType, setModalType] = useState(''); // 'income', 'partner'
    const [notification, setNotification] = useState(null); // For new updates

    // --- Firebase Initialization & Auth ---
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setLogLevel('Debug'); // Enable Firestore logging

            setDb(dbInstance);
            setAuth(authInstance);

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setUserId(user.uid);
                    setIsAuthReady(true);
                } else {
                    try {
                        // Use Vercel env var for auth token if it exists
                        if (initialAuthToken) {
                            await signInWithCustomToken(authInstance, initialAuthToken);
                        } else {
                            await signInAnonymously(authInstance);
                        }
                    } catch (authError) {
                        console.error("Error signing in: ", authError);
                    }
                }
            });
            return () => unsubscribe();
        } catch (e) {
            console.error("Error initializing Firebase:", e);
        }
    }, []);

    // --- Data Paths ---
    const paths = useMemo(() => {
        if (!appId || !db) return null; // Added db check
        const basePath = `/artifacts/${appId}/public/data`;
        return {
            income: collection(db, `${basePath}/income`),
            budgets: collection(db, `${basePath}/budgets`),
            partners: collection(db, `${basePath}/partners`),
        };
    }, [db, appId]);

    // --- Real-time Data Listeners (Firestore) ---
    useEffect(() => {
        if (!isAuthReady || !paths) return;

        // Income Listener
        const incomeQuery = query(paths.income);
        const unsubscribeIncome = onSnapshot(incomeQuery, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Notification logic
            snapshot.docChanges().forEach((change) => {
                // Only notify if data was already loaded
                if (incomeData.length > 0) {
                    const changedData = change.doc.data();
                    let message = '';
                    if (change.type === 'added') {
                        message = `New Entry: ${changedData.incomeType} - $${changedData.value}`;
                    } else if (change.type === 'modified') {
                         message = `Updated: ${changedData.incomeType} - $${changedData.value}`;
                    }

                    if(message) {
                        setNotification(message);
                    }
                }
            });
            
            setIncomeData(data); // Set data after processing changes
            
        }, (error) => console.error("Error listening to income:", error));

        // Budget Listener
        const budgetQuery = query(paths.budgets);
        const unsubscribeBudgets = onSnapshot(budgetQuery, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setBudgetData(data);
        }, (error) => console.error("Error listening to budgets:", error));

        // Partners Listener
        const partnersQuery = query(paths.partners);
        const unsubscribePartners = onSnapshot(partnersQuery, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPartners(data);
        }, (error) => console.error("Error listening to partners:", error));

        return () => {
            unsubscribeIncome();
            unsubscribeBudgets();
            unsubscribePartners();
        };
    }, [isAuthReady, paths, incomeData.length]); // Re-run if auth is ready or paths change


    // --- Helper Functions ---
    const generateInvoiceNumber = () => `AVE-${Date.now()}`;
    const getPartners = (type) => partners.filter(p => p.type === type);
    
    // --- CRUD Operations ---

    // Save/Update Income
    const handleSaveIncome = async (income) => {
        if (!paths) return;
        try {
            if (income.id) {
                // Update existing
                const docRef = doc(paths.income, income.id);
                await setDoc(docRef, income, { merge: true });
            } else {
                // Create new
                await addDoc(paths.income, {
                    ...income,
                    status: 'pending', // Default status for new entries
                    invoiceNumber: generateInvoiceNumber(),
                    createdAt: new Date().toISOString(),
                });
            }
            setShowModal(false);
            setEditingItem(null);
        } catch (e) {
            console.error("Error saving income: ", e);
        }
    };

    // Validate Income
    const handleValidateIncome = async (incomeId) => {
        if (!paths) return;
        try {
            const docRef = doc(paths.income, incomeId);
            await setDoc(docRef, { status: 'posted' }, { merge: true });
            setNotification(`Entry ${incomeId.substring(0, 5)}... validated!`);
        } catch (e) {
            console.error("Error validating income: ", e);
        }
    };

    // Delete Income
    const handleDeleteIncome = async (incomeId) => {
        if (!paths) return;
        // We can add a custom modal for confirmation later
        // For now, direct delete
        try {
            const docRef = doc(paths.income, incomeId);
            await deleteDoc(docRef);
        } catch (e)
            {
            console.error("Error deleting income: ", e);
        }
    };

    // Save/Update Partner
    const handleSavePartner = async (partner) => {
        if (!paths) return;
        try {
            if (partner.id) {
                // Update
                const docRef = doc(paths.partners, partner.id);
                await setDoc(docRef, partner, { merge: true });
            } else {
                // Create
                await addDoc(paths.partners, partner);
            }
            setShowModal(false);
            setEditingItem(null);
        } catch (e) {
            console.error("Error saving partner: ", e);
        }
    };

    // Delete Partner
    const handleDeletePartner = async (partnerId) => {
        if (!paths) return;
         try {
            const docRef = doc(paths.partners, partnerId);
            await deleteDoc(docRef);
        } catch (e) {
            console.error("Error deleting partner: ", e);
        }
    };

    // Save Budget
    const handleSaveBudget = async (month, type, value) => {
        if (!paths) return;
        try {
            // Use a composite ID to ensure one budget entry per month/type
            const docId = `${month}-${type.replace(/ /g, '')}`; // Make ID filesystem safe
            const docRef = doc(paths.budgets, docId);
            await setDoc(docRef, {
                month, // e.g., "2025-10"
                type,  // e.g., "Procurement Income"
                value: parseFloat(value) || 0
            }, { merge: true }); // Use merge to be safe
        } catch (e) {
            console.error("Error saving budget: ", e);
        }
    };

    // --- UI Handlers ---
    const openModal = (type, item = null) => {
        setModalType(type);
        setEditingItem(item);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingItem(null);
        setModalType('');
    };

    if (!isAuthReady || !db || !auth) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="text-lg font-medium text-gray-700">Loading Commercial Tracker...</div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-gray-100 font-inter">
            {/* Sidebar Navigation */}
            <Sidebar view={view} setView={setView} />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Top Header */}
                <Header userId={userId} />

                {/* Notification Banner */}
                {notification && (
                    <NotificationBanner
                        message={notification}
                        onDismiss={() => setNotification(null)}
                    />
                )}

                {/* Page Content */}
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-6 md:p-8">
                    {view === 'dashboard' && <DashboardView incomeData={incomeData} budgetData={budgetData} />}
                    {view === 'income' && (
                        <IncomeManagementView
                            incomeData={incomeData}
                            partners={partners}
                            onAdd={() => openModal('income')}
                            onEdit={(item) => openModal('income', item)}
                            onDelete={handleDeleteIncome}
                            onValidate={handleValidateIncome}
                        />
                    )}
                    {view === 'budgets' && (
                         <BudgetManagementView
                            budgetData={budgetData}
                            onSaveBudget={handleSaveBudget}
                        />
                    )}
                    {view === 'partners' && (
                        <PartnerManagementView
                            partners={partners}
                            onAdd={(type) => openModal('partner', { type })}
                            onEdit={(item) => openModal('partner', item)}
                            onDelete={handleDeletePartner}
                        />
                    )}
                </main>
            </div>

            {/* Modal */}
            {showModal && (
                <Modal onClose={closeModal} modalType={modalType} isEditing={!!editingItem}>
                    {modalType === 'income' && (
                        <IncomeForm
                            initialData={editingItem}
                            customers={getPartners('customer')}
                            suppliers={getPartners('supplier')}
                            onSave={handleSaveIncome}
                            onClose={closeModal}
                        />
                    )}
                    {modalType === 'partner' && (
                        <PartnerForm
                            initialData={editingItem}
                            onSave={handleSavePartner}
                            onClose={closeModal}
                        />
                    )}
                </Modal>
            )}
        </div>
    );
}

// --- Sub-Components ---

const Sidebar = ({ view, setView }) => {
    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'income', label: 'Income Manager', icon: DollarSign },
        { id: 'budgets', label: 'Budget Manager', icon: Target },
        { id: 'partners', label: 'Partners', icon: Users },
    ];

    return (
        <nav className="w-20 md:w-64 bg-white shadow-lg">
            <div className="flex items-center justify-center md:justify-start md:pl-6 h-20 border-b">
                <span className="text-blue-600 md:hidden"><FileText size={28} /></span>
                <span className="hidden md:block text-2xl font-bold text-blue-600">AVE Tracker</span>
            </div>
            <ul className="flex flex-col items-center md:items-start py-4">
                {navItems.map(item => (
                    <SidebarItem
                        key={item.id}
                        item={item}
                        isActive={view === item.id}
                        onClick={() => setView(item.id)}
                    />
                ))}
            </ul>
        </nav>
    );
};

const SidebarItem = ({ item, isActive, onClick }) => (
    <li className="w-full">
        <button
            onClick={onClick}
            className={`flex items-center justify-center md:justify-start w-full h-14 md:pl-6 my-1 transition-colors duration-200
                ${isActive
                    ? 'text-blue-600 bg-blue-50 border-r-4 border-blue-600'
                    : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                }`}
        >
            <item.icon size={22} />
            <span className="hidden md:block ml-4 text-sm font-medium">{item.label}</span>
        </button>
    </li>
);

const Header = ({ userId }) => (
    <header className="flex items-center justify-between h-20 px-6 bg-white border-b">
        <h1 className="text-2xl font-semibold text-gray-800">Commercial Dashboard</h1>
        <div className="flex items-center">
            {userId && <span className="hidden sm:inline text-sm text-gray-600 mr-4">User ID: {userId}</span>}
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                AV
            </div>
        </div>
    </header>
);

const NotificationBanner = ({ message, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onDismiss();
        }, 5000); // Auto-dismiss after 5 seconds
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 flex justify-between items-center">
            <div className="flex items-center">
                <Bell size={20} className="mr-3" />
                <span className="font-medium">{message}</span>
            </div>
            <button onClick={onDismiss} className="text-green-700 hover:text-green-900">
                <X size={20} />
            </button>
        </div>
    );
};

// --- Page View Components ---

// --- Dashboard View ---
const DashboardView = ({ incomeData, budgetData }) => {
    // Target date range
    const startDate = new Date('2025-10-01T00:00:00Z');
    const endDate = new Date('2026-09-30T23:59:59Z');

    // Generate month keys for the period
    const months = useMemo(() => {
        let arr = [];
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            arr.push(currentDate.toISOString().substring(0, 7)); // "YYYY-MM"
            currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
        }
        return arr;
    }, [startDate, endDate]);

    // Filter and process data
    const processedData = useMemo(() => {
        const filteredIncome = incomeData
            .filter(item => {
                if (!item.agreementStartDate) return false;
                const itemDate = new Date(item.agreementStartDate);
                return itemDate >= startDate && itemDate <= endDate && item.status === 'posted';
            });
            
        const filteredBudgets = budgetData.filter(item => months.includes(item.month));

        // 1. Income by Type (Bar Chart)
        const incomeByType = filteredIncome.reduce((acc, item) => {
            const type = item.incomeType || 'Uncategorized';
            if (!acc[type]) {
                acc[type] = 0;
            }
            acc[type] += parseFloat(item.value) || 0;
            return acc;
        }, {});
        
        const incomeByTypeChartData = Object.keys(incomeByType).map(key => ({
            name: key,
            Value: incomeByType[key]
        }));

        // 2. Income vs Budget Over Time (Line Chart)
        const timeData = months.map(month => {
            const monthlyIncome = filteredIncome
                .filter(item => item.agreementStartDate.startsWith(month))
                .reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
                
            const monthlyBudget = filteredBudgets
                .filter(item => item.month === month)
                .reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
            
            return {
                name: month,
                Income: monthlyIncome,
                Budget: monthlyBudget
            };
        });

        // 3. KPIs
        const totalIncome = timeData.reduce((sum, m) => sum + m.Income, 0);
        const totalBudget = timeData.reduce((sum, m) => sum + m.Budget, 0);
        const variance = totalIncome - totalBudget;

        return { incomeByTypeChartData, timeData, totalIncome, totalBudget, variance };

    }, [incomeData, budgetData, months, startDate, endDate]);

    const { incomeByTypeChartData, timeData, totalIncome, totalBudget, variance } = processedData;

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-700">Oct 1 2025 - Sep 30 2026 Tracker</h2>
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KpiCard title="Total Income (Posted)" value={`$${totalIncome.toLocaleString()}`} />
                <KpiCard title="Total Budget" value={`$${totalBudget.toLocaleString()}`} />
                <KpiCard 
                    title="Variance" 
                    value={`$${variance.toLocaleString()}`} 
                    className={variance >= 0 ? 'text-green-600' : 'text-red-600'}
                />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Income vs. Budget Over Time">
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={timeData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                            <Legend />
                            <Line type="monotone" dataKey="Income" stroke="#3b82f6" strokeWidth={2} />
                            <Line type="monotone" dataKey="Budget" stroke="#8884d8" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Income by Type (Posted)">
                     <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={incomeByTypeChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                            <Legend />
                            <Bar dataKey="Value" fill="#3b82f6" />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>
        </div>
    );
};

const KpiCard = ({ title, value, className = 'text-gray-900' }) => (
    <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-sm font-medium text-gray-500 uppercase">{title}</h3>
        <p className={`text-3xl font-semibold mt-2 ${className}`}>{value}</p>
    </div>
);

const ChartCard = ({ title, children }) => (
    <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">{title}</h3>
        {children}
    </div>
);


// --- Income Management View ---
const IncomeManagementView = ({ incomeData, partners, onAdd, onEdit, onDelete, onValidate }) => {
    
    // Sort data: pending first, then by date
    const sortedIncome = useMemo(() => {
        return [...incomeData].sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            if (a.status !== 'pending' && b.status === 'pending') return 1;
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); // Sort by creation date
        });
    }, [incomeData]);

    const getPartnerName = (id) => partners.find(p => p.id === id)?.name || 'Unknown';

    return (
        <Card>
            <CardHeader title="Income Management" onAction={onAdd} actionIcon={Plus} actionLabel="Add Income" />
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <Th>Status</Th>
                            <Th>Start Date</Th>
                            <Th>Partner</Th>
                            <Th>Type</Th>
                            <Th>Value</Th>
                            <Th>Invoice #</Th>
                            <Th>Invoice Status</Th>
                            <Th>Actions</Th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {sortedIncome.length === 0 && (
                            <tr>
                                <Td colSpan="8" className="text-center text-gray-500 py-8">
                                    No income entries yet. Click "Add Income" to get started.
                                </Td>
                            </tr>
                        )}
                        {sortedIncome.map(item => (
                            <tr key={item.id} className={item.status === 'pending' ? 'bg-yellow-50' : ''}>
                                <Td>
                                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full
                                        ${item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                        {item.status}
                                    </span>
                                </Td>
                                <Td>{item.agreementStartDate}</Td>
                                <Td>{getPartnerName(item.partnerId)}</Td>
                                <Td>{item.incomeType}</Td>
                                <Td>${parseFloat(item.value || 0).toLocaleString()}</Td>
                                <Td>{item.invoiceNumber}</Td>
                                <Td>{item.invoiceStatus}</Td>
                                <Td>
                                    <div className="flex space-x-2">
                                        {item.status === 'pending' && (
                                            <IconButton onClick={() => onValidate(item.id)} icon={CheckSquare} className="text-green-600 hover:text-green-800" title="Validate" />
                                        )}
                                        <IconButton onClick={() => onEdit(item)} icon={Edit2} className="text-blue-600 hover:text-blue-800" title="Edit" />
                                        <IconButton onClick={() => onDelete(item.id)} icon={Trash2} className="text-red-600 hover:text-red-800" title="Delete" />
                                    </div>
                                </Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};


// --- Budget Management View ---
const BudgetManagementView = ({ budgetData, onSaveBudget }) => {
    // Target date range
    const startDate = new Date('2025-10-01T00:00:00Z');
    const endDate = new Date('2026-09-30T23:59:59Z');

    const months = useMemo(() => {
        let arr = [];
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            arr.push({
                key: currentDate.toISOString().substring(0, 7), // "YYYY-MM"
                name: currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })
            });
            currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
        }
        return arr;
    }, [startDate, endDate]);

    const getBudgetValue = (monthKey, type) => {
        const entry = budgetData.find(b => b.month === monthKey && b.type === type);
        return entry ? entry.value : '';
    };

    // Use state to manage input changes before saving on blur
    const [localBudgets, setLocalBudgets] = useState({});

    const handleBudgetChange = (monthKey, type, value) => {
        const id = `${monthKey}-${type}`;
        setLocalBudgets(prev => ({ ...prev, [id]: value }));
    };

    const handleBudgetSave = (monthKey, type) => {
        const id = `${monthKey}-${type}`;
        const value = localBudgets[id];
        
        // Only save if the value is defined (i.e., it was changed)
        // or if it's not in local state, use the DB value (to handle tabbing without changes)
        let valueToSave;
        if (value !== undefined) {
            valueToSave = value;
        } else {
            valueToSave = getBudgetValue(monthKey, type);
        }
        
        onSaveBudget(monthKey, type, valueToSave);
    };
    
    const getLocalOrDbValue = (monthKey, type) => {
        const id = `${monthKey}-${type}`;
        return localBudgets[id] !== undefined ? localBudgets[id] : getBudgetValue(monthKey, type);
    }

    return (
        <Card>
            <CardHeader title="Budget Manager (Oct 2025 - Sep 2026)" />
             <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <Th>Month</Th>
                            <Th>Procurement Income Budget</Th>
                            <Th>Consultancy Budget</Th>
                            <Th>Total Monthly Budget</Th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {months.map(month => {
                            const procBudget = getLocalOrDbValue(month.key, 'Procurement Income');
                            const consBudget = getLocalOrDbValue(month.key, 'Consultancy');
                            const total = (parseFloat(procBudget) || 0) + (parseFloat(consBudget) || 0);

                            return (
                                <tr key={month.key}>
                                    <Td className="font-medium">{month.name}</Td>
                                    <Td>
                                        <BudgetInput
                                            value={procBudget}
                                            onChange={(e) => handleBudgetChange(month.key, 'Procurement Income', e.target.value)}
                                            onBlur={() => handleBudgetSave(month.key, 'Procurement Income')}
                                        />
                                    </Td>
                                    <Td>
                                        <BudgetInput
                                            value={consBudget}
                                            onChange={(e) => handleBudgetChange(month.key, 'Consultancy', e.target.value)}
                                            onBlur={() => handleBudgetSave(month.key, 'Consultancy')}
                                        />
                                    </Td>
                                    <Td>${total.toLocaleString()}</Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

const BudgetInput = ({ value, onChange, onBlur }) => (
    <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">$</span>
        <input
            type="number"
            className="pl-7 pr-3 py-2 w-full border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            value={value}
            onChange={onChange}
            onBlur={onBlur} // Save on blur
            placeholder="0"
        />
    </div>
);


// --- Partner Management View ---
const PartnerManagementView = ({ partners, onAdd, onEdit, onDelete }) => {
    const customers = partners.filter(p => p.type === 'customer');
    const suppliers = partners.filter(p => p.type === 'supplier');

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PartnerList
                title="Customers"
                partners={customers}
                onAdd={() => onAdd('customer')}
                onEdit={onEdit}
                onDelete={onDelete}
            />
            <PartnerList
                title="Suppliers"
                partners={suppliers}
                onAdd={() => onAdd('supplier')}
                onEdit={onEdit}
                onDelete={onDelete}
            />
        </div>
    );
};

const PartnerList = ({ title, partners, onAdd, onEdit, onDelete }) => (
    <Card>
        <CardHeader title={title} onAction={onAdd} actionIcon={Plus} actionLabel={`Add ${title}`} />
        <ul className="divide-y divide-gray-200">
            {partners.length === 0 && (
                <li className="p-4 text-center text-gray-500">No {title.toLowerCase()} found.</li>
            )}
            {partners.map(partner => (
                <li key={partner.id} className="p-4 flex justify-between items-center">
                    <div>
                        <div className="font-medium text-gray-900">{partner.name}</div>
                        <div className="text-sm text-gray-500">{partner.contactName} - {partner.contactEmail}</div>
                    </div>
                    <div className="flex space-x-2">
                        <IconButton onClick={() => onEdit(partner)} icon={Edit2} className="text-blue-600 hover:text-blue-800" title="Edit" />
                        <IconButton onClick={() => onDelete(partner.id)} icon={Trash2} className="text-red-600 hover:text-red-800" title="Delete" />
                    </div>
                </li>
            ))}
        </ul>
    </Card>
);


// --- Reusable UI Components ---
const Card = ({ children }) => (
    <div className="bg-white shadow-md rounded-lg overflow-hidden">
        {children}
    </div>
);

const CardHeader = ({ title, onAction, actionIcon: Icon, actionLabel }) => (
    <div className="p-4 md:p-6 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
        {onAction && (
            <Button onClick={onAction} icon={Icon} label={actionLabel} />
        )}
    </div>
);

const Button = ({ onClick, label, icon: Icon, variant = 'primary', type = 'button' }) => {
    const variants = {
        primary: 'bg-blue-600 text-white hover:bg-blue-700',
        secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
        danger: 'bg-red-600 text-white hover:bg-red-700',
    };
    return (
        <button
            type={type}
            onClick={onClick}
            className={`flex items-center justify-center px-4 py-2 rounded-md font-medium shadow-sm transition-colors ${variants[variant]}`}
        >
            {Icon && <Icon size={18} className="mr-2" />}
            {label}
        </button>
    );
};

const IconButton = ({ onClick, icon: Icon, className = '', title = '' }) => (
    <button
        onClick={onClick}
        className={`p-1 rounded-full transition-colors ${className}`}
        title={title}
    >
        <Icon size={18} />
    </button>
);

const Th = ({ children }) => (
    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
        {children}
    </th>
);

const Td = ({ children, className = '', ...props }) => (
    <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-700 ${className}`} {...props}>
        {children}
    </td>
);

// --- Modal and Forms ---
const Modal = ({ children, onClose, modalType, isEditing }) => {
    
    const title = useMemo(() => {
        if (modalType === 'income') {
            return isEditing ? 'Edit Income Entry' : 'Add New Income Entry';
        }
        if (modalType === 'partner') {
            return isEditing ? 'Edit Partner' : 'Add New Partner';
        }
        return 'Modal';
    }, [modalType, isEditing]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
            <div 
                className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()} // Prevent closing modal when clicking inside
            >
                <div className="p-4 border-b flex justify-between items-center">
                     <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
                    <IconButton onClick={onClose} icon={X} className="text-gray-500 hover:text-gray-800" />
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}

// --- Income Form ---
const IncomeForm = ({ initialData, customers, suppliers, onSave, onClose }) => {
    const [formData, setFormData] = useState(
        initialData || {
            incomeType: 'Procurement Income',
            partnerId: '',
            value: '',
            agreementStartDate: '',
            agreementEndDate: '',
            invoiceStatus: 'pending'
        }
    );
    
    // Determine which partner list to show
    const relevantPartners = formData.incomeType === 'Procurement Income' ? suppliers : customers;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    // When income type changes, reset partnerId
    useEffect(() => {
        // Only reset if it's a new item, not if editing
        if (!initialData) {
            setFormData(prev => ({ ...prev, partnerId: '' }));
        }
    }, [formData.incomeType, initialData]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            
            <FormSelect
                label="Income Type"
                name="incomeType"
                value={formData.incomeType}
                onChange={handleChange}
                options={[
                    { value: 'Procurement Income', label: 'Procurement Income' },
                    { value: 'Consultancy', label: 'Consultancy' }
                ]}
            />
            
            <FormSelect
                label={formData.incomeType === 'Procurement Income' ? 'Supplier' : 'Customer'}
                name="partnerId"
                value={formData.partnerId}
                onChange={handleChange}
                options={relevantPartners.map(p => ({ value: p.id, label: p.name }))}
                placeholder="Select a partner"
                required
            />
            
            <FormInput
                label="Value"
                name="value"
                type="number"
                value={formData.value}
                onChange={handleChange}
                placeholder="5000"
                required
            />
            
             <FormSelect
                label="Invoice Status"
                name="invoiceStatus"
                value={formData.invoiceStatus}
                onChange={handleChange}
                options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'sent', label: 'Sent' },
                    { value: 'paid', label: 'Paid' },
                    { value: 'overdue', label: 'Overdue' }
                ]}
            />

            <div className="grid grid-cols-2 gap-4">
                <FormInput
                    label="Agreement Start Date"
                    name="agreementStartDate"
                    type="date"
                    value={formData.agreementStartDate}
                    onChange={handleChange}
                    required
                />
                <FormInput
                    label="Agreement End Date"
                    name="agreementEndDate"
                    type="date"
                    value={formData.agreementEndDate}
                    onChange={handleChange}
                />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
                <Button label="Cancel" onClick={onClose} variant="secondary" />
                <Button label="Save Income" type="submit" variant="primary" />
            </div>
        </form>
    );
};


// --- Partner Form ---
const PartnerForm = ({ initialData, onSave, onClose }) => {
    const [formData, setFormData] = useState(
        initialData || {
            type: 'customer',
            name: '',
            contactName: '',
            contactEmail: '',
            contactPhone: ''
        }
    );

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            
            <FormSelect
                label="Partner Type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                options={[
                    { value: 'customer', label: 'Customer' },
                    { value: 'supplier', label: 'Supplier' }
                ]}
            />
            
            <FormInput
                label="Company Name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Acme Corp"
                required
            />
            
             <FormInput
                label="Contact Name"
                name="contactName"
                value={formData.contactName}
                onChange={handleChange}
                placeholder="Jane Doe"
            />
            
             <FormInput
                label="Contact Email"
                name="contactEmail"
                type="email"
                value={formData.contactEmail}
                onChange={handleChange}
                placeholder="jane.doe@acme.com"
            />
            
             <FormInput
                label="Contact Phone"
                name="contactPhone"
                type="tel"
                value={formData.contactPhone}
                onChange={handleChange}
                placeholder="+44 20 7946 0958"
            />
            
            <div className="flex justify-end space-x-3 pt-4">
                <Button label="Cancel" onClick={onClose} variant="secondary" />
                <Button label="Save Partner" type="submit" variant="primary" />
            </div>
        </form>
    );
};


// --- Form Field Components ---
const FormInput = ({ label, name, type = 'text', value, onChange, placeholder = '', required = false }) => (
    <div>
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
            {label} {required && '*'}
        </label>
        <input
            type={type}
            name={name}
            id={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            required={required}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
    </div>
);

const FormSelect = ({ label, name, value, onChange, options, placeholder = 'Select...', required = false }) => (
     <div>
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
            {label} {required && '*'}
        </label>
        <select
            name={name}
            id={name}
            value={value}
            onChange={onChange}
            required={required}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
            <option value="" disabled>{placeholder}</option>
            {options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    </div>
);
