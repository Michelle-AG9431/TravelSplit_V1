import React, { useState, useEffect, useMemo } from 'react';
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
  addDoc, 
  query, 
  onSnapshot, 
  orderBy, 
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { 
  Plus, 
  Users, 
  Calculator, 
  Settings, 
  LogOut, 
  Wallet, 
  RefreshCw, 
  ArrowRight,
  Check,
  AlertCircle,
  Divide,
  Edit3,
  Trash2
} from 'lucide-react';

// --- Firebase Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyCiQfni4uaJ0Elr0dj5zq1PyENHPD4ZBJY",
  authDomain: "travelsplit-3a5b7.firebaseapp.com",
  projectId: "travelsplit-3a5b7",
  storageBucket: "travelsplit-3a5b7.firebasestorage.app",
  messagingSenderId: "942926093596",
  appId: "1:942926093596:web:72c8052d5c9e1cbadc6ed9",
  measurementId: "G-SN1PX2RJRE"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Types & Interfaces ---
interface Rate {
  code: string;
  name: string;
  rate: number; // 1 Foreign Unit = X TWD
  symbol: string;
}

interface Expense {
  id: string;
  payerName: string; 
  description: string;
  amount: number;
  currency: string;
  exchangeRate: number; 
  twdAmount: number;
  splitMode: 'equal' | 'custom'; // 分帳模式
  beneficiaries: string[]; // 用於平均分攤
  customAllocations?: Record<string, number>; // 用於自訂分帳 { "Name": amount }
  createdAt: any;
  createdBy: string; 
}

// Default Rates
const DEFAULT_RATES: Rate[] = [
  { code: 'TWD', name: '新台幣', rate: 1, symbol: 'NT$' },
  { code: 'USD', name: '美金', rate: 32.5, symbol: '$' },
  { code: 'JPY', name: '日幣', rate: 0.215, symbol: '¥' },
  { code: 'KRW', name: '韓元', rate: 0.024, symbol: '₩' },
  { code: 'EUR', name: '歐元', rate: 34.2, symbol: '€' },
];

// --- Main Component ---
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // App State
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [isInRoom, setIsInRoom] = useState(false);
  
  // Data State
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<string[]>([]); 
  const [rates, setRates] = useState<Rate[]>(DEFAULT_RATES);
  const [activeTab, setActiveTab] = useState<'expenses' | 'add' | 'settle' | 'settings'>('expenses');

  // --- Auth Logic ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Firestore Listeners ---
  useEffect(() => {
    if (!user || !roomId || !isInRoom) return;

    // 1. Listen to Expenses
    const qExpenses = query(
      collection(db, 'artifacts', appId, 'public', 'data', `travelsplit_${roomId}_expenses`), 
      orderBy('createdAt', 'desc')
    );
    
    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(data);
    }, (err) => console.error("Expenses Listener Error", err));

    // 2. Listen to Room Settings (Rates & Members)
    const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', `travelsplit_${roomId}_settings`, 'config');
    const unsubSettings = onSnapshot(roomDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.rates) setRates(data.rates);
        if (data.members) setMembers(data.members);
      } else {
        // Initialize room if new
        setDoc(roomDocRef, {
          rates: DEFAULT_RATES,
          members: [userName], 
          createdAt: serverTimestamp()
        });
        setMembers([userName]);
      }
    }, (err) => console.error("Settings Listener Error", err));

    return () => {
      unsubExpenses();
      unsubSettings();
    };
  }, [user, roomId, isInRoom]);

  // --- Actions ---

  const handleJoinRoom = async () => {
    if (!roomId.trim() || !userName.trim()) return;
    
    if (user) {
      const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', `travelsplit_${roomId}_settings`, 'config');
      try {
        const snap = await getDoc(roomDocRef);
        if (snap.exists()) {
          const data = snap.data();
          const currentMembers = data.members || [];
          if (!currentMembers.includes(userName)) {
            await updateDoc(roomDocRef, {
              members: [...currentMembers, userName]
            });
          }
        }
      } catch (e) {
        console.error("Error joining room", e);
      }
    }
    
    setIsInRoom(true);
  };

  const handleUpdateRates = async (newRates: Rate[]) => {
    if (!roomId) return;
    const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', `travelsplit_${roomId}_settings`, 'config');
    await updateDoc(roomDocRef, { rates: newRates });
  };

  const handleAddMember = async (name: string) => {
    if (!name.trim() || !roomId) return;
    const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', `travelsplit_${roomId}_settings`, 'config');
    const snap = await getDoc(roomDocRef);
    if (snap.exists()) {
       const currentMembers = snap.data().members || [];
       if (!currentMembers.includes(name)) {
         await updateDoc(roomDocRef, { members: [...currentMembers, name] });
       }
    }
  };

  // --- Views ---

  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-50 text-gray-500">載入中...</div>;

  if (!isInRoom) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calculator className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">旅費分分清</h1>
            <p className="text-gray-500 mt-2">支援自訂分帳的多人記帳神器</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">房間代碼 (Room ID)</label>
              <input 
                type="text" 
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="例如: Toyko2024"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">您的暱稱</label>
              <input 
                type="text" 
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="例如: 小明"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              />
            </div>

            <button 
              onClick={handleJoinRoom}
              disabled={!roomId || !userName}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              進入記帳 <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 max-w-md mx-auto relative shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 pt-8 sticky top-0 z-10 shadow-md">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">{roomId}</h2>
            <p className="text-blue-100 text-sm">嗨，{userName}</p>
          </div>
          <button onClick={() => setIsInRoom(false)} className="p-2 bg-blue-500 rounded-full hover:bg-blue-400 transition">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4">
        {activeTab === 'expenses' && (
          <ExpensesView expenses={expenses} rates={rates} />
        )}
        
        {activeTab === 'add' && (
          <AddExpenseView 
            members={members} 
            rates={rates} 
            currentUser={userName}
            roomId={roomId}
            onSuccess={() => setActiveTab('expenses')}
          />
        )}

        {activeTab === 'settle' && (
          <SettlementView expenses={expenses} members={members} />
        )}

        {activeTab === 'settings' && (
          <SettingsView 
            rates={rates} 
            members={members}
            onUpdateRates={handleUpdateRates}
            onAddMember={handleAddMember}
          />
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-2 pb-6 max-w-md mx-auto z-20">
        <NavButton icon={Wallet} label="帳目" isActive={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} />
        <NavButton icon={Plus} label="記一筆" isActive={activeTab === 'add'} onClick={() => setActiveTab('add')} isMain />
        <NavButton icon={Calculator} label="結算" isActive={activeTab === 'settle'} onClick={() => setActiveTab('settle')} />
        <NavButton icon={Settings} label="設定" isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
      </div>
    </div>
  );
}

// --- Sub-Components ---

const NavButton = ({ icon: Icon, label, isActive, onClick, isMain = false }: any) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center ${isMain ? '-mt-8' : ''}`}
  >
    <div className={`
      ${isMain 
        ? 'w-14 h-14 bg-blue-600 rounded-full shadow-lg text-white mb-1' 
        : isActive ? 'text-blue-600' : 'text-gray-400'} 
      flex items-center justify-center transition-all duration-200
    `}>
      <Icon size={isMain ? 28 : 24} />
    </div>
    <span className={`text-xs font-medium ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
      {label}
    </span>
  </button>
);

// 1. Expenses List
const ExpensesView = ({ expenses, rates }: { expenses: Expense[], rates: Rate[] }) => {
  const formatMoney = (amount: number) => Math.round(amount).toLocaleString();
  const totalTwd = useMemo(() => expenses.reduce((acc, curr) => acc + curr.twdAmount, 0), [expenses]);

  return (
    <div className="space-y-4 pb-12">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
        <div>
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">總支出 (NT$)</p>
          <p className="text-2xl font-bold text-gray-800">${formatMoney(totalTwd)}</p>
        </div>
        <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
          <Wallet size={20} />
        </div>
      </div>

      <div className="space-y-3">
        {expenses.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p>還沒有帳目，快去記一筆吧！</p>
          </div>
        ) : (
          expenses.map((expense) => (
            <div key={expense.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-gray-800 text-lg">{expense.description}</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                    {expense.payerName} 付款
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <span>{new Date(expense.createdAt?.seconds * 1000).toLocaleDateString()}</span>
                  <span>•</span>
                  {expense.splitMode === 'custom' ? (
                     <span className="flex items-center text-orange-500"><Edit3 size={10} className="mr-1"/> 自訂分帳</span>
                  ) : (
                     <span className="flex items-center text-blue-500"><Divide size={10} className="mr-1"/> 平均分帳 ({expense.beneficiaries.length}人)</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-800 text-lg">
                  {rates.find(r => r.code === expense.currency)?.symbol}
                  {expense.amount.toLocaleString()}
                </p>
                {expense.currency !== 'TWD' && (
                  <p className="text-xs text-gray-400">≈ NT${Math.round(expense.twdAmount).toLocaleString()}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// 2. Add Expense Form (Updated with Custom Split)
const AddExpenseView = ({ members, rates, currentUser, roomId, onSuccess }: any) => {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('TWD');
  const [payer, setPayer] = useState(currentUser);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Split Logic
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [selectedMembers, setSelectedMembers] = useState<string[]>(members);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});

  // Initialize custom amounts when members change or mode switches
  useEffect(() => {
    setSelectedMembers(members);
    const initialCustom: Record<string, string> = {};
    members.forEach((m: string) => initialCustom[m] = '');
    setCustomAmounts(initialCustom);
  }, [members.length]);

  const toggleMember = (name: string) => {
    if (selectedMembers.includes(name)) {
      if (selectedMembers.length > 1) { 
        setSelectedMembers(selectedMembers.filter(m => m !== name));
      }
    } else {
      setSelectedMembers([...selectedMembers, name]);
    }
  };

  const handleCustomAmountChange = (name: string, val: string) => {
    setCustomAmounts(prev => ({ ...prev, [name]: val }));
  };

  // Validation Logic
  const totalAmount = parseFloat(amount) || 0;
  const allocatedTotal = Object.values(customAmounts)
    .reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  const remaining = totalAmount - allocatedTotal;
  
  // Epsilon for float comparison
  const isBalanced = Math.abs(remaining) < 0.1; 
  const isValid = description && totalAmount > 0 && payer && 
    (splitMode === 'equal' ? selectedMembers.length > 0 : isBalanced);

  const handleSubmit = async () => {
    if (!isValid) return;
    
    setIsSubmitting(true);
    const rateObj = rates.find((r: Rate) => r.code === currency) || DEFAULT_RATES[0];
    const numAmount = parseFloat(amount);
    const twdAmount = numAmount * rateObj.rate;

    // Prepare Custom Allocations (convert string to number)
    const finalCustomAllocations: Record<string, number> = {};
    if (splitMode === 'custom') {
      Object.entries(customAmounts).forEach(([name, val]) => {
        const valNum = parseFloat(val);
        if (valNum > 0) finalCustomAllocations[name] = valNum;
      });
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', `travelsplit_${roomId}_expenses`), {
        payerName: payer,
        description,
        amount: numAmount,
        currency,
        exchangeRate: rateObj.rate,
        twdAmount,
        splitMode,
        beneficiaries: splitMode === 'equal' ? selectedMembers : [],
        customAllocations: splitMode === 'custom' ? finalCustomAllocations : {},
        createdBy: currentUser,
        createdAt: serverTimestamp()
      });
      onSuccess();
    } catch (e) {
      console.error("Add failed", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currencySymbol = rates.find((r:Rate) => r.code === currency)?.symbol || '$';

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-6 pb-20">
      <h3 className="text-xl font-bold text-gray-800">新增消費</h3>
      
      {/* Basic Info */}
      <div className="space-y-4">
        <div>
          <label className="text-sm text-gray-500 font-medium mb-1 block">項目名稱</label>
          <input 
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="例如: 晚餐、計程車"
            className="w-full p-3 bg-gray-50 rounded-lg border-none focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
             <label className="text-sm text-gray-500 font-medium mb-1 block">幣別</label>
             <select 
               value={currency}
               onChange={e => setCurrency(e.target.value)}
               className="w-full p-3 bg-gray-50 rounded-lg border-none focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
             >
               {rates.map((r: Rate) => (
                 <option key={r.code} value={r.code}>{r.code} ({r.symbol})</option>
               ))}
             </select>
          </div>
          <div className="col-span-2">
             <label className="text-sm text-gray-500 font-medium mb-1 block">總金額</label>
             <input 
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full p-3 bg-gray-50 rounded-lg border-none focus:ring-2 focus:ring-blue-500 outline-none font-mono text-lg"
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-500 font-medium mb-1 block">誰付的錢？</label>
          <div className="flex flex-wrap gap-2">
            {members.map((m: string) => (
              <button
                key={m}
                onClick={() => setPayer(m)}
                className={`px-4 py-2 rounded-full text-sm transition ${
                  payer === m 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Split Mode Toggle */}
        <div className="p-1 bg-gray-100 rounded-lg flex">
            <button 
              onClick={() => setSplitMode('equal')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition flex items-center justify-center gap-2 ${
                splitMode === 'equal' ? 'bg-white shadow text-blue-600' : 'text-gray-500'
              }`}
            >
              <Divide size={16} /> 平均分攤
            </button>
            <button 
              onClick={() => setSplitMode('custom')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition flex items-center justify-center gap-2 ${
                splitMode === 'custom' ? 'bg-white shadow text-blue-600' : 'text-gray-500'
              }`}
            >
              <Edit3 size={16} /> 自訂金額
            </button>
        </div>

        {/* Split Logic UI */}
        {splitMode === 'equal' ? (
          <div>
             <label className="text-sm text-gray-500 font-medium mb-1 block">分給誰？ (點選切換)</label>
             <div className="grid grid-cols-2 gap-2">
               {members.map((m: string) => {
                 const selected = selectedMembers.includes(m);
                 return (
                   <button
                     key={m}
                     onClick={() => toggleMember(m)}
                     className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition border ${
                       selected
                         ? 'border-blue-500 bg-blue-50 text-blue-700' 
                         : 'border-gray-200 bg-white text-gray-400'
                     }`}
                   >
                     <span>{m}</span>
                     {selected && <Check size={14} />}
                   </button>
                 );
               })}
             </div>
             <div className="mt-2 text-right text-xs text-gray-400">
                每人約 {currencySymbol}{selectedMembers.length > 0 ? (totalAmount / selectedMembers.length).toFixed(2) : 0}
             </div>
          </div>
        ) : (
          <div className="space-y-3">
             <label className="text-sm text-gray-500 font-medium block">輸入每人金額</label>
             {members.map((m: string) => (
                <div key={m} className="flex items-center gap-2">
                   <span className="w-20 text-sm font-medium text-gray-700 truncate">{m}</span>
                   <div className="flex-1 relative">
                      <span className="absolute left-3 top-2.5 text-gray-400 text-xs">{currencySymbol}</span>
                      <input 
                        type="number"
                        placeholder="0"
                        value={customAmounts[m]}
                        onChange={(e) => handleCustomAmountChange(m, e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                      />
                   </div>
                </div>
             ))}

             {/* Validation Message */}
             <div className={`p-3 rounded-lg flex items-start gap-2 text-sm ${
                isBalanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
             }`}>
                {isBalanced ? (
                   <Check size={18} className="mt-0.5" />
                ) : (
                   <AlertCircle size={18} className="mt-0.5" />
                )}
                <div className="flex-1">
                   <div className="flex justify-between font-bold">
                     <span>總額: {totalAmount}</span>
                     <span>已分: {allocatedTotal}</span>
                   </div>
                   {!isBalanced && (
                      <div className="mt-1 font-bold">
                         {remaining > 0 ? `還差 ${currencySymbol}${remaining.toFixed(2)}` : `多出 ${currencySymbol}${Math.abs(remaining).toFixed(2)}`}
                      </div>
                   )}
                </div>
             </div>
          </div>
        )}

      </div>

      <button 
        onClick={handleSubmit}
        disabled={isSubmitting || !isValid}
        className={`w-full font-bold py-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 ${
           isSubmitting || !isValid 
             ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
             : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
        }`}
      >
        {isSubmitting ? '儲存中...' : '確認新增'}
      </button>
    </div>
  );
};

// 3. Settlement Logic (Updated for Mixed Modes)
const SettlementView = ({ expenses, members }: { expenses: Expense[], members: string[] }) => {
  const debts = useMemo(() => {
    // 1. Calculate Balances
    const balances: Record<string, number> = {};
    members.forEach(m => balances[m] = 0);

    expenses.forEach(exp => {
      const paidBy = exp.payerName;
      // Convert everything to TWD for unified calculation
      const rate = exp.exchangeRate; 

      if (exp.splitMode === 'equal') {
         // --- EQUAL MODE ---
         const totalTwd = exp.twdAmount;
         const splitAmong = exp.beneficiaries;
         if (splitAmong.length === 0) return;
         
         const splitAmountTwd = totalTwd / splitAmong.length;

         balances[paidBy] += totalTwd; // Payer paid full amount (+)
         splitAmong.forEach(person => {
           balances[person] -= splitAmountTwd; // Consumer consumes share (-)
         });

      } else if (exp.splitMode === 'custom' && exp.customAllocations) {
         // --- CUSTOM MODE ---
         // Payer paid the full bill in TWD terms
         balances[paidBy] += exp.twdAmount;

         // Deduct amount from each person based on their custom allocation
         Object.entries(exp.customAllocations).forEach(([person, amountInOriginalCurrency]) => {
            const amountInTwd = amountInOriginalCurrency * rate;
            balances[person] = (balances[person] || 0) - amountInTwd;
         });
      }
    });

    // 2. Simplify Debts (Greedy Algorithm)
    const debtors: { name: string, amount: number }[] = [];
    const creditors: { name: string, amount: number }[] = [];

    Object.entries(balances).forEach(([name, amount]) => {
      if (amount < -1) debtors.push({ name, amount }); 
      if (amount > 1) creditors.push({ name, amount }); 
    });

    debtors.sort((a, b) => a.amount - b.amount); 
    creditors.sort((a, b) => b.amount - a.amount); 

    const transactions = [];
    let i = 0; 
    let j = 0; 

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      
      const amount = Math.min(Math.abs(debtor.amount), creditor.amount);
      
      transactions.push({
        from: debtor.name,
        to: creditor.name,
        amount: Math.round(amount)
      });

      debtor.amount += amount;
      creditor.amount -= amount;

      if (Math.abs(debtor.amount) < 1) i++;
      if (creditor.amount < 1) j++;
    }

    return transactions;
  }, [expenses, members]);

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 rounded-2xl shadow-lg text-white">
        <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
          <Calculator size={24} /> 最佳結算方案
        </h3>
        <p className="opacity-90 text-sm">系統已自動整合「平均分攤」與「自訂分帳」的所有消費。</p>
      </div>

      {debts.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl shadow-sm">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">目前沒有欠款，大家兩清了！</p>
        </div>
      ) : (
        <div className="space-y-3">
          {debts.map((t, idx) => (
            <div key={idx} className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-bold text-gray-800 text-lg">{t.from}</span>
                <div className="flex flex-col items-center">
                   <span className="text-xs text-gray-400">給付</span>
                   <ArrowRight className="text-gray-300" size={20} />
                </div>
                <span className="font-bold text-gray-800 text-lg">{t.to}</span>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-green-600">NT$ {t.amount.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div className="text-center text-xs text-gray-400 mt-4">
        * 結算金額四捨五入至整數位
      </div>
    </div>
  );
};

// 4. Settings (Rates & Members) - Same as before
const SettingsView = ({ rates, members, onUpdateRates, onAddMember }: any) => {
  const [newMemberName, setNewMemberName] = useState('');
  const [editingRates, setEditingRates] = useState<Rate[]>(JSON.parse(JSON.stringify(rates)));
  const [hasChanges, setHasChanges] = useState(false);

  const handleRateChange = (code: string, val: string) => {
    const num = parseFloat(val);
    setEditingRates(prev => prev.map(r => r.code === code ? { ...r, rate: isNaN(num) ? 0 : num } : r));
    setHasChanges(true);
  };

  const saveRates = () => {
    onUpdateRates(editingRates);
    setHasChanges(false);
  };

  const addMember = () => {
    if (newMemberName.trim()) {
      onAddMember(newMemberName.trim());
      setNewMemberName('');
    }
  };

  const resetToDefault = () => {
    if(confirm('確定要重設為系統預設匯率嗎？')) {
        setEditingRates(DEFAULT_RATES);
        setHasChanges(true);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      
      {/* Members Section */}
      <div className="bg-white p-5 rounded-xl shadow-sm space-y-4">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <Users size={20} className="text-blue-500"/> 成員管理
        </h3>
        <div className="flex flex-wrap gap-2">
          {members.map((m: string) => (
            <span key={m} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-medium">
              {m}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input 
            value={newMemberName}
            onChange={e => setNewMemberName(e.target.value)}
            placeholder="新增成員名字..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
          />
          <button 
            onClick={addMember}
            disabled={!newMemberName}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
          >
            新增
          </button>
        </div>
      </div>

      {/* Rates Section */}
      <div className="bg-white p-5 rounded-xl shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <RefreshCw size={20} className="text-blue-500"/> 匯率設定 (對台幣)
          </h3>
          <button onClick={resetToDefault} className="text-xs text-blue-500 underline">重設預設</button>
        </div>
        
        <p className="text-xs text-gray-500 bg-yellow-50 p-2 rounded border border-yellow-100">
          ⚠️ 提示：為求精確，建議參考 <a href="https://rate.bot.com.tw/xrt?Lang=zh-TW" target="_blank" rel="noreferrer" className="text-blue-600 underline">台灣銀行牌告匯率</a> (現金賣出) 手動輸入當日數值。
        </p>

        <div className="grid gap-3">
          {editingRates.map((r) => (
             r.code !== 'TWD' && (
               <div key={r.code} className="flex items-center justify-between border-b border-gray-50 pb-2">
                 <div className="flex items-center gap-2">
                   <span className="font-bold w-12">{r.code}</span>
                   <span className="text-xs text-gray-400">{r.name}</span>
                 </div>
                 <div className="flex items-center gap-2">
                   <span className="text-gray-400 text-sm">1 {r.symbol} = </span>
                   <input 
                      type="number" 
                      value={r.rate}
                      onChange={(e) => handleRateChange(r.code, e.target.value)}
                      className="w-20 text-right font-mono border rounded px-1 py-1 focus:ring-1 focus:ring-blue-500 outline-none"
                   />
                   <span className="text-gray-400 text-sm">TWD</span>
                 </div>
               </div>
             )
          ))}
        </div>

        {hasChanges && (
          <button 
            onClick={saveRates}
            className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg mt-2 animate-pulse"
          >
            儲存匯率設定
          </button>
        )}
      </div>
    </div>
  );
};