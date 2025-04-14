// App.tsx (Corregido - Sin comentario sobrante)
import React, { useState, useEffect } from 'react';
import { Wallet, CircleDollarSign, CheckCircle, List, Users, ShieldCheck, ShieldAlert, Loader } from 'lucide-react';
import CreateChallenge from './components/CreateChallenge';
import ChallengeList from './components/ChallengeList';
import VerifyMatch from './components/VerifyMatch';
import ConnectWallet from './components/ConnectWallet';
import TeamManagement from './components/TeamManagement';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import clsx from 'clsx'; // Asegúrate de tenerlo instalado: npm install clsx

// Declaración global (Mover a *.d.ts es mejor, pero la dejamos aquí por ahora)
declare global {
    interface Window {
        ethereum?: {
            request: (request: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
            on?: (event: string, listener: (...args: any[]) => void) => void;
            removeListener?: (event: string, listener: (...args: any[]) => void) => void;
        }
    }
}

const CONTRACT_ADDRESS = '0x9fef9cb6026067b533fea49249a7151dc6b7bf0b';

function App() {
    // Estados
    const [walletAddress, setWalletAddress] = useState<string>('');
    const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
    const [supabaseUserUuid, setSupabaseUserUuid] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'create' | 'list' | 'verify' | 'team'>('create');
    const [loadingAuth, setLoadingAuth] = useState(true);

    // Efecto Conexión Wallet
    useEffect(() => {
        const handleAccountsChanged = (newAccounts: string[]) => {
            if (newAccounts.length > 0) { setWalletAddress(newAccounts[0]); }
            else { setWalletAddress(''); setSupabaseSession(null); setSupabaseUserUuid(null); setActiveTab('create'); setLoadingAuth(false); }
        };
        const connectWalletOnPageLoad = async () => {
             if (window.ethereum) {
                 try {
                     const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                     if (accounts.length > 0) { setWalletAddress(accounts[0]); }
                     else { setLoadingAuth(false); }
                     window.ethereum?.on?.('accountsChanged', handleAccountsChanged);
                 } catch (error) { console.error("Error checking wallet", error); setLoadingAuth(false); }
             } else { setLoadingAuth(false); }
         };
        connectWalletOnPageLoad();
        return () => { window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged); };
    }, []);

    // Efecto Sesión Supabase
    useEffect(() => {
        setLoadingAuth(true);
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSupabaseSession(session); setSupabaseUserUuid(session?.user?.id ?? null); setLoadingAuth(false);
        }).catch(error => { console.error("Error getting session", error); setSupabaseSession(null); setSupabaseUserUuid(null); setLoadingAuth(false); });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSupabaseSession(session); setSupabaseUserUuid(session?.user?.id ?? null); setLoadingAuth(false);
        });
        return () => { subscription?.unsubscribe(); };
    }, []);

    // Handlers
    const handleTeamCreated = (teamId: number) => { console.log("Team Created ID:", teamId); setActiveTab('list'); };
    const handleConnectWallet = async () => {
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                if (accounts.length > 0) { setWalletAddress(accounts[0]); }
            } catch (error: any) {
                 if (error.code === 4001) { alert('Rechazaste la conexión.'); }
                 else { alert(`Error al conectar: ${error.message || 'Error desconocido'}`); }
            }
        } else { alert('MetaMask no está instalado.'); }
     };

    // Render Content
    const renderContent = () => {
      if (!walletAddress) return <ConnectWallet onConnect={handleConnectWallet} />;
       if (loadingAuth) { return ( <div className='flex justify-center items-center p-10 text-center opacity-70'><Loader className="w-5 h-5 mr-2 animate-spin" />Verificando sesión...</div> ); }
      switch (activeTab) {
          case 'team': return <TeamManagement session={supabaseSession} onTeamCreated={handleTeamCreated} />;
          case 'create': return <CreateChallenge account={supabaseUserUuid} contractAddress={CONTRACT_ADDRESS} />;
          case 'list': return <ChallengeList walletAddress={walletAddress} supabaseUuid={supabaseUserUuid} contractAddress={CONTRACT_ADDRESS} />;
          case 'verify': return <VerifyMatch account={walletAddress} contractAddress={CONTRACT_ADDRESS} />;
          default: setActiveTab('create'); return <div className='text-center p-4 opacity-70'>Selecciona una opción arriba.</div>;
      }
    };

    // JSX
    return (
        <div className="min-h-screen"> {/* Hereda bg-black text-[#39FF14] */}
            <>
                {/* Header Estilizado */}
                <header className="bg-black border-b border-[#39FF14]/30 shadow-lg shadow-[#39FF14]/10">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between h-16">
                            <div className="flex items-center">
                                <div className="flex-shrink-0 flex items-center">
                                    <h1 className="text-xl font-bold">Deadlock Challenge</h1>
                                </div>
                            </div>
                            {walletAddress && (
                                <div className="flex items-center space-x-4">
                                    <span title={loadingAuth ? 'Verificando...' : supabaseSession ? 'Sesión Activa' : 'Sin Sesión'} className={clsx( `hidden sm:flex items-center text-xs px-2 py-0.5 rounded border`, loadingAuth ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300 animate-pulse' : supabaseSession ? 'bg-green-500/20 border-green-500/50 text-green-300' : 'bg-red-500/20 border-red-500/50 text-red-300' )}>
                                        {loadingAuth ? <Loader className="w-3 h-3 mr-1 animate-spin" /> : supabaseSession ? <ShieldCheck className="w-3 h-3 mr-1" /> : <ShieldAlert className="w-3 h-3 mr-1" />}
                                        {loadingAuth ? 'Verificando...' : supabaseSession ? 'Sesión OK' : 'Sin Sesión'}
                                    </span>
                                    <span className="text-sm opacity-80" title={walletAddress}><Wallet className="inline w-4 h-4 mr-1 align-text-bottom opacity-70"/>{`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}</span>
                                </div>
                            )}
                            {!walletAddress && ( <div className="flex items-center"><button onClick={handleConnectWallet} className="bg-[#39FF14] hover:bg-[#32DB12] text-black px-3 py-1 rounded-md text-sm font-bold transition-colors">Conectar Wallet</button></div> )}
                        </div>
                    </div>
                </header>

                {/* Pestañas Estilizadas */}
                {walletAddress && (
                    <div className="flex justify-center space-x-2 sm:space-x-4 py-3 bg-black/50 border-b border-[#39FF14]/20 shadow-md shadow-black/30 overflow-x-auto px-2">
                        <button onClick={() => setActiveTab('team')} className={clsx( 'flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black', activeTab === 'team' ? 'bg-[#39FF14] text-black shadow-sm' : 'text-[#39FF14]/80 hover:bg-[#39FF14]/10 hover:text-[#39FF14]' )}> <Users className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5" /> Equipo </button>
                        <button onClick={() => setActiveTab('create')} className={clsx( 'flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black', activeTab === 'create' ? 'bg-[#39FF14] text-black shadow-sm' : 'text-[#39FF14]/80 hover:bg-[#39FF14]/10 hover:text-[#39FF14]' )}> <CircleDollarSign className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5" /> Crear Desafío </button>
                        <button onClick={() => setActiveTab('list')} className={clsx( 'flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black', activeTab === 'list' ? 'bg-[#39FF14] text-black shadow-sm' : 'text-[#39FF14]/80 hover:bg-[#39FF14]/10 hover:text-[#39FF14]' )}> <List className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5" /> Ver Desafíos </button>
                        <button onClick={() => setActiveTab('verify')} className={clsx( 'flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black', activeTab === 'verify' ? 'bg-[#39FF14] text-black shadow-sm' : 'text-[#39FF14]/80 hover:bg-[#39FF14]/10 hover:text-[#39FF14]' )}> <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5" /> Verificar Partida </button>
                    </div>
                )}

                {/* Contenido Principal */}
                <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                    {renderContent()}
                </main>

                {/* Footer Estilizado */}
                <footer className="border-t border-[#39FF14]/30 py-6 text-center opacity-70 text-xs mt-16">
                    <p>© {new Date().getFullYear()} Deadlock Challenge Platform. All rights reserved.</p>
                </footer>
            </>
        {/* Aquí ya no está el comentario problemático */}
        </div> // Cierre del div principal
    ); // Cierre del return
} // Cierre de la función App

export default App;