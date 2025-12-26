import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Camera, Monitor, Play, Square, Pen, Circle, Share2,
    Wifi, Battery, ChevronLeft, Eraser, Link, AlertCircle,
    ArrowRight, X, Undo2, MousePointer2
} from 'lucide-react';
import Peer from 'peerjs';

// --- CONSTANTS & STYLES ---
const GLASS_PANEL = "bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl transition-all duration-300";
const BENTO_ROUND = "rounded-[24px]";

// --- HOOK: WEB RTC & SIGNALING ---
const useOpticSignaling = (role, inputRoomId = null) => {
    const [peer, setPeer] = useState(null);
    const [myId, setMyId] = useState('');
    const [status, setStatus] = useState('INIT');
    const [streams, setStreams] = useState([]);
    const [tally, setTally] = useState('STANDBY');
    const connectionsRef = useRef([]);

    useEffect(() => {
        let newPeer;

        const init = async () => {
            setStatus('CONNECTING');
            // ID préfixé par "multicam-" pour éviter les collisions sur le serveur public
            const id = role === 'DIRECTOR'
                ? `multicam-${Math.floor(Math.random() * 10000)}`
                : undefined;

            try {
                // Import dynamique pour éviter les erreurs côté serveur (Next.js/SSR)
                const PeerJs = (await import('peerjs')).default;
                newPeer = new PeerJs(id);

                newPeer.on('open', (id) => {
                    setMyId(id);
                    setStatus('READY');
                    if (role === 'SATELLITE' && inputRoomId) {
                        connectToDirector(newPeer, inputRoomId);
                    }
                });

                // --- DIRECTOR: Réception d'appels (Flux Vidéo) ---
                newPeer.on('call', (call) => {
                    if (role === 'DIRECTOR') {
                        call.answer();
                        call.on('stream', (remoteStream) => {
                            setStreams(prev => {
                                // Éviter les doublons
                                if (prev.find(s => s.id === call.peer)) return prev;
                                return [...prev, { id: call.peer, stream: remoteStream }];
                            });
                        });
                    }
                });

                // --- GESTION DES DONNÉES (Tally Light) ---
                newPeer.on('connection', (conn) => {
                    conn.on('open', () => {
                        connectionsRef.current.push(conn);
                        conn.on('data', (data) => {
                            if (data.type === 'TALLY') setTally(data.status);
                        });
                    });
                });

                setPeer(newPeer);
            } catch (err) {
                setStatus('ERROR');
                console.error("PeerJS Error:", err);
            }
        };

        init();

        return () => {
            if (newPeer) newPeer.destroy();
        };
    }, [role, inputRoomId]);

    const connectToDirector = async (currentPeer, directorId) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, facingMode: 'environment' },
                audio: false
            });
            const call = currentPeer.call(directorId, stream);
            const conn = currentPeer.connect(directorId);
            conn.on('data', (data) => {
                if (data.type === 'TALLY') setTally(data.status);
            });
            setStreams([{ id: 'local', stream }]);
        } catch (err) {
            console.error("Erreur caméra:", err);
            alert("Impossible d'accéder à la caméra.");
        }
    };

    const broadcastTally = (newStatus) => {
        setTally(newStatus);
        connectionsRef.current.forEach(conn => {
            if (conn.open) conn.send({ type: 'TALLY', status: newStatus });
        });
    };

    return { myId, status, streams, tally, broadcastTally };
};

// --- APP COMPONENT ---
const App = () => {
    const [view, setView] = useState('LANDING');
    const [targetRoomId, setTargetRoomId] = useState('');

    return (
        <div className="w-full h-screen bg-black text-white font-sans overflow-hidden selection:bg-blue-500/30">
            {view === 'LANDING' && (
                <LandingScreen
                    onSelectRole={(role) => setView(role)}
                    onJoinRoom={(id) => {
                        setTargetRoomId(id);
                        setView('SATELLITE');
                    }}
                />
            )}

            {view === 'DIRECTOR' && (
                <DirectorDashboard onBack={() => setView('LANDING')} />
            )}

            {view === 'SATELLITE' && (
                <SatelliteView
                    onBack={() => setView('LANDING')}
                    roomId={targetRoomId}
                />
            )}
        </div>
    );
};

// --- 1. LANDING SCREEN ---
const LandingScreen = ({ onSelectRole, onJoinRoom }) => {
    const [roomIdInput, setRoomIdInput] = useState('');
    const [isJoinMode, setIsJoinMode] = useState(false);

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden">
            {/* Background FX */}
            <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />

            <div className="z-10 text-center space-y-8 max-w-4xl px-6 w-full">
                <div className="space-y-2">
                    <h1 className="text-6xl font-bold tracking-tighter bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
                        MultiCam
                    </h1>
                    <p className="text-white/50 text-lg">Système de captation multi-angles synchronisé</p>
                </div>

                {!isJoinMode ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mx-auto">
                        <RoleCard
                            title="Hub"
                            icon={<Monitor size={32} />}
                            desc="Créer une salle (Host). Recevoir les flux et analyser."
                            onClick={() => onSelectRole('DIRECTOR')}
                            color="blue"
                        />
                        <RoleCard
                            title="Caméra"
                            icon={<Camera size={32} />}
                            desc="Rejoindre une salle. Transformer ce téléphone en satellite."
                            onClick={() => setIsJoinMode(true)}
                            color="green"
                        />
                    </div>
                ) : (
                    <div className={`max-w-md mx-auto w-full p-8 ${GLASS_PANEL} ${BENTO_ROUND} animate-in fade-in zoom-in duration-300`}>
                        <button onClick={() => setIsJoinMode(false)} className="mb-4 text-white/50 hover:text-white flex items-center gap-2 text-sm">
                            <ChevronLeft size={16} /> Retour
                        </button>
                        <h3 className="text-2xl font-bold mb-4">Rejoindre le Hub</h3>
                        <input
                            type="text"
                            placeholder="Entrez l'ID de la Room (ex: multicam-1234)"
                            className="w-full bg-black/40 border border-white/20 rounded-xl p-4 text-center text-xl font-mono mb-4 focus:outline-none focus:border-blue-500 transition-colors"
                            value={roomIdInput}
                            onChange={(e) => setRoomIdInput(e.target.value)}
                        />
                        <button
                            onClick={() => onJoinRoom(roomIdInput)}
                            disabled={!roomIdInput}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all"
                        >
                            Connecter la Caméra
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- 2. DIRECTOR DASHBOARD ---
const DirectorDashboard = ({ onBack }) => {
    const { myId, streams, tally, broadcastTally } = useOpticSignaling('DIRECTOR');

    const [activeStreamId, setActiveStreamId] = useState(null);
    const [mode, setMode] = useState('LIVE');
    const [showInfo, setShowInfo] = useState(true);

    const activeStream = activeStreamId
        ? streams.find(s => s.id === activeStreamId)?.stream
        : streams[0]?.stream;

    const toggleRecording = () => {
        const newStatus = tally === 'STANDBY' ? 'RECORDING' : 'STANDBY';
        broadcastTally(newStatus);
    };

    return (
        <div className="flex h-full w-full p-4 gap-4 bg-[#0a0a0a]">

            {/* MAIN STAGE */}
            <div className="flex flex-col flex-grow gap-4 w-3/4 h-full relative">
                <div className={`relative flex-grow ${GLASS_PANEL} ${BENTO_ROUND} overflow-hidden group bg-[#111]`}>

                    {/* Room ID Overlay */}
                    {showInfo && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur-md p-8 rounded-3xl text-center border border-white/10 z-50">
                            <p className="text-white/50 text-sm uppercase tracking-widest mb-2">Room ID</p>
                            <h2 className="text-4xl font-mono font-bold text-blue-400 mb-4 select-text">{myId || "Génération..."}</h2>
                            <p className="text-xs text-white/30 max-w-xs mx-auto">Entrez cet ID sur les téléphones "Caméra" pour les connecter.</p>
                            <button onClick={() => setShowInfo(false)} className="mt-6 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm">Masquer</button>
                        </div>
                    )}

                    {/* Video Player */}
                    {activeStream ? (
                        <VideoPlayer stream={activeStream} className="w-full h-full object-contain" />
                    ) : (
                        !showInfo && <div className="absolute inset-0 flex items-center justify-center text-white/10 text-2xl">En attente de caméras...</div>
                    )}

                    {/* Telestrator Layer (CANVAS) */}
                    {mode === 'ANALYSIS' && <TelestratorCanvas />}

                    {/* UI Overlay */}
                    <div className="absolute top-6 left-6 flex gap-2 z-40">
                        <button onClick={onBack} className="p-2 rounded-full bg-black/40 hover:bg-white/20 text-white/70 backdrop-blur-md transition-colors mr-2">
                            <ChevronLeft size={16} />
                        </button>
                        <div className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase backdrop-blur-md border border-white/5 ${mode === 'LIVE' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400'}`}>
                            {mode}
                        </div>
                        {tally === 'RECORDING' && (
                            <div className="px-3 py-1.5 bg-red-500 rounded-full text-xs font-bold text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                                REC
                            </div>
                        )}
                    </div>
                </div>

                {/* Controls */}
                <div className={`h-24 ${GLASS_PANEL} ${BENTO_ROUND} flex items-center px-8 justify-between shrink-0`}>
                    <div className="flex items-center gap-6">
                        <button onClick={toggleRecording} className="group relative flex items-center justify-center">
                            <div className={`w-14 h-14 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${tally === 'RECORDING' ? 'border-red-500 bg-red-500/10' : 'border-white/20 group-hover:border-white'}`}>
                                <div className={`transition-all duration-300 ${tally === 'RECORDING' ? 'w-5 h-5 bg-red-500 rounded-sm' : 'w-12 h-12 bg-red-500 rounded-full'}`} />
                            </div>
                        </button>
                        <div className="flex flex-col">
                            <span className="text-xs text-white/40 uppercase tracking-widest font-semibold">Sources</span>
                            <span className="text-xl font-mono tabular-nums tracking-tight text-white/90">{streams.length} Connectée(s)</span>
                        </div>
                    </div>

                    <div className="flex items-center bg-black/20 p-1.5 rounded-full border border-white/5">
                        <button onClick={() => setMode('LIVE')} className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${mode === 'LIVE' ? 'bg-white text-black shadow-lg' : 'text-white/50'}`}>Live</button>
                        <button onClick={() => setMode('ANALYSIS')} className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${mode === 'ANALYSIS' ? 'bg-white text-black shadow-lg' : 'text-white/50'}`}>Analyse</button>
                    </div>

                    <button onClick={() => setShowInfo(true)} className="p-3 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors">
                        <Link size={20} />
                    </button>
                </div>
            </div>

            {/* MULTIVIEW GRID */}
            <div className="w-1/4 flex flex-col gap-4 h-full">
                <h2 className="px-2 text-xs font-bold text-white/40 uppercase tracking-widest pt-2">Caméras</h2>
                <div className="flex flex-col gap-3 overflow-y-auto pr-1 pb-2">
                    {streams.map((s, idx) => (
                        <div
                            key={s.id}
                            onClick={() => setActiveStreamId(s.id)}
                            className={`aspect-video rounded-xl relative cursor-pointer overflow-hidden transition-all duration-200 group ${activeStreamId === s.id ? 'ring-2 ring-blue-500 shadow-lg scale-[1.02]' : 'opacity-60 hover:opacity-100'} ${GLASS_PANEL}`}
                        >
                            <VideoPlayer stream={s.stream} muted className="w-full h-full object-cover" />
                            <div className="absolute bottom-2 left-2 z-20 text-[10px] font-bold text-white bg-black/50 px-2 py-0.5 rounded">CAM {idx + 1}</div>
                        </div>
                    ))}
                    {streams.length === 0 && (
                        <div className="p-6 text-center text-white/20 text-xs border border-dashed border-white/10 rounded-xl">Aucune source</div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- 3. SATELLITE VIEW ---
const SatelliteView = ({ onBack, roomId }) => {
    const { status, streams, tally } = useOpticSignaling('SATELLITE', roomId);
    const localStream = streams[0]?.stream;

    const isRecording = tally === 'RECORDING';
    const borderColor = isRecording ? 'border-red-500' : 'border-green-500';
    const statusText = isRecording ? 'ON AIR' : 'STANDBY';

    return (
        <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center">
            <div className={`absolute inset-0 z-50 pointer-events-none transition-all duration-300 border-[12px] rounded-[32px] ${borderColor} ${isRecording ? 'animate-pulse' : 'opacity-50'}`} />

            <div className="w-full h-full bg-[#1c1c1e] relative">
                {localStream ? (
                    <VideoPlayer stream={localStream} muted className="w-full h-full object-cover" />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 gap-4">
                        {status === 'ERROR' ? <AlertCircle size={48} className="text-red-500" /> : <Wifi size={48} className="animate-pulse" />}
                        <span className="font-mono text-sm">{status === 'CONNECTING' ? 'Connexion au Hub...' : status}</span>
                    </div>
                )}
            </div>

            <div className="absolute top-8 left-8 right-8 flex justify-between items-start z-40">
                <button onClick={onBack} className="p-2 rounded-full bg-black/40 backdrop-blur text-white/70 hover:bg-white/20">
                    <ChevronLeft size={20} />
                </button>

                <div className={`px-4 py-2 rounded-full backdrop-blur-xl border border-white/10 flex items-center gap-3 transition-colors ${isRecording ? 'bg-red-500/80' : 'bg-black/60'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-white animate-pulse' : 'bg-green-500'}`} />
                    <span className="text-xs font-black tracking-widest text-white">{statusText}</span>
                </div>

                <div className="flex gap-2">
                    <div className="bg-black/40 backdrop-blur px-3 py-1.5 rounded-lg flex items-center gap-2 text-white/80 border border-white/10">
                        <Battery size={14} /> <span className="text-[10px] font-mono">100%</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENT: TELESTRATOR (AMÉLIORÉ) ---
const TelestratorCanvas = () => {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState('PEN'); // PEN, ARROW, CROSS, CIRCLE
    const [color, setColor] = useState('#FACC15'); // Jaune par défaut

    // Undo Stack
    const [history, setHistory] = useState([]);

    // Refs pour la logique de dessin de formes (drag & drop)
    const startPos = useRef({ x: 0, y: 0 });
    const snapshot = useRef(null); // Capture l'écran avant le début de la forme pour "l'aperçu"

    // Helper coordonnées
    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    // Sauvegarder l'état actuel pour le Undo
    const saveToHistory = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setHistory(prev => [...prev, data]);
    };

    const undo = () => {
        if (history.length === 0) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const newHistory = [...history];
        const previousState = newHistory.pop(); // Récupère le dernier état

        if (previousState) {
            ctx.putImageData(previousState, 0, 0);
            setHistory(newHistory);
        }
    };

    const clearCanvas = () => {
        saveToHistory(); // Sauvegarde avant d'effacer pour pouvoir annuler l'effacement
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const startDrawing = (e) => {
        const { x, y } = getPos(e);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // 1. Sauvegarde pour Undo
        saveToHistory();

        // 2. Sauvegarde pour l'aperçu dynamique des formes
        snapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        startPos.current = { x, y };

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        setIsDrawing(true);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const { x, y } = getPos(e);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (tool === 'PEN') {
            ctx.lineTo(x, y);
            ctx.stroke();
        } else {
            // Pour les formes : On efface (restore snapshot) et on redessine la nouvelle forme
            ctx.putImageData(snapshot.current, 0, 0);
            ctx.beginPath();

            const sx = startPos.current.x;
            const sy = startPos.current.y;

            ctx.strokeStyle = color;
            ctx.lineWidth = 4;

            if (tool === 'ARROW') drawArrow(ctx, sx, sy, x, y);
            else if (tool === 'CROSS') drawCross(ctx, sx, sy, x, y);
            else if (tool === 'CIRCLE') drawCircle(ctx, sx, sy, x, y);

            ctx.stroke();
        }
    };

    // --- LOGIQUE DES FORMES GÉOMÉTRIQUES ---
    const drawArrow = (ctx, fromX, fromY, toX, toY) => {
        const headlen = 20; // taille de la tête
        const dx = toX - fromX;
        const dy = toY - fromY;
        const angle = Math.atan2(dy, dx);

        // Ligne principale
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);

        // Tête de flèche
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    };

    const drawCross = (ctx, startX, startY, endX, endY) => {
        // Une croix délimitée par la boîte de drag & drop
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.moveTo(startX, endY);
        ctx.lineTo(endX, startY);
    };

    const drawCircle = (ctx, startX, startY, endX, endY) => {
        const radiusX = Math.abs(endX - startX) / 2;
        const radiusY = Math.abs(endY - startY) / 2;
        const centerX = (startX + endX) / 2;
        const centerY = (startY + endY) / 2;

        // Ellipse parfaite qui rentre dans le rectangle tracé
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = canvas.parentElement.offsetHeight;

        const handleResize = () => {
            // Note: Le resize efface le canvas par défaut en HTML5. 
            // Pour une vraie app de prod, il faudrait redessiner l'historique ici.
            canvas.width = canvas.parentElement.offsetWidth;
            canvas.height = canvas.parentElement.offsetHeight;
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <>
            <canvas
                ref={canvasRef}
                className="absolute inset-0 z-30 cursor-crosshair touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={() => setIsDrawing(false)}
                onMouseLeave={() => setIsDrawing(false)}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={() => setIsDrawing(false)}
            />

            {/* --- BARRE D'OUTILS DE DESSIN --- */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 p-2 rounded-full bg-black/80 backdrop-blur-xl border border-white/10 z-50 animate-in slide-in-from-bottom-4 shadow-2xl">

                {/* Couleurs */}
                <ColorBtn color="#FACC15" active={color} onClick={setColor} />
                <ColorBtn color="#EF4444" active={color} onClick={setColor} />
                <ColorBtn color="#3B82F6" active={color} onClick={setColor} />

                <div className="w-[1px] bg-white/20 mx-1" />

                {/* Outils */}
                <ToolBtn icon={<Pen size={18} />} active={tool === 'PEN'} onClick={() => setTool('PEN')} />
                <ToolBtn icon={<ArrowRight size={18} />} active={tool === 'ARROW'} onClick={() => setTool('ARROW')} />
                <ToolBtn icon={<Circle size={18} />} active={tool === 'CIRCLE'} onClick={() => setTool('CIRCLE')} />
                <ToolBtn icon={<X size={18} />} active={tool === 'CROSS'} onClick={() => setTool('CROSS')} />

                <div className="w-[1px] bg-white/20 mx-1" />

                {/* Actions */}
                <button onClick={undo} className="p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors" title="Annuler">
                    <Undo2 size={18} />
                </button>
                <button onClick={clearCanvas} className="p-2 text-red-400 hover:text-red-300 rounded-full hover:bg-white/10 transition-colors" title="Tout effacer">
                    <Eraser size={18} />
                </button>
            </div>
        </>
    );
};

// --- HELPER UI COMPONENTS ---
const ToolBtn = ({ icon, active, onClick }) => (
    <button
        onClick={onClick}
        className={`p-2 rounded-full transition-all duration-200 ${active ? 'bg-white text-black shadow-lg scale-110' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
    >
        {icon}
    </button>
);

const ColorBtn = ({ color, active, onClick }) => (
    <button
        onClick={() => onClick(color)}
        className={`w-8 h-8 rounded-full border-2 transition-all duration-200 ${active === color ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}
        style={{ background: color }}
    />
);

const VideoPlayer = ({ stream, muted = false, className }) => {
    const ref = useRef(null);
    useEffect(() => {
        if (ref.current && stream) ref.current.srcObject = stream;
    }, [stream]);
    return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
};

const RoleCard = ({ title, icon, desc, onClick, color }) => (
    <button
        onClick={onClick}
        className={`group relative p-8 ${GLASS_PANEL} ${BENTO_ROUND} hover:bg-white/10 transition-all duration-300 text-left`}
    >
        <div className={`absolute top-6 right-6 p-3 rounded-full transition-colors ${color === 'blue' ? 'bg-blue-500/20 text-blue-400 group-hover:bg-blue-500 group-hover:text-white' : 'bg-green-500/20 text-green-400 group-hover:bg-green-500 group-hover:text-white'}`}>
            {icon}
        </div>
        <div className="mt-12 space-y-2">
            <h3 className="text-2xl font-semibold">{title}</h3>
            <p className="text-white/40 text-sm leading-relaxed">{desc}</p>
        </div>
    </button>
);

export default App;