
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Search, Calendar, Clock, RefreshCw, Radio, 
  FileText, Music, Loader2, AlertCircle, Activity 
} from 'lucide-react';
import { jsPDF } from 'jspdf';

// --- CONFIGURAÇÕES DO SISTEMA ---
// ID Corrigido conforme sua solicitação original (case-sensitive)
const CSV_URL = 'https://docs.google.com/spreadsheets/d/1xFRBBHpmn38TiBdZcwn2556811FKkfbeEB3HmmdxT1s/export?format=csv';
const ARTWORK_CACHE = new Map();

// --- SERVIÇO DE CAPAS ---
const fetchArtwork = async (artist: string, track: string) => {
  const query = `${artist} ${track}`.toLowerCase().trim();
  if (ARTWORK_CACHE.has(query)) return ARTWORK_CACHE.get(query);
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
    const data = await res.json();
    const url = data.results?.[0]?.artworkUrl100 || null;
    ARTWORK_CACHE.set(query, url);
    return url;
  } catch { return null; }
};

// --- COMPONENTE DE CARD ---
const MusicCard = ({ track, isNowPlaying = false }: { track: any, isNowPlaying?: boolean }) => {
  const [artwork, setArtwork] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(true);

  useEffect(() => {
    fetchArtwork(track.artista, track.musica).then(url => {
      setArtwork(url);
      setImgLoading(false);
    });
  }, [track.artista, track.musica]);

  return (
    <div className={`flex items-center gap-4 sm:gap-6 p-4 sm:p-5 transition-all duration-300 ${
      isNowPlaying 
      ? 'bg-slate-900 rounded-[2rem] border-4 border-yellow-400 shadow-2xl scale-[1.02] z-10' 
      : 'bg-white rounded-3xl border border-slate-100 hover:shadow-xl hover:-translate-y-1'
    }`}>
      <div className="relative flex-shrink-0">
        <div className={`overflow-hidden rounded-2xl bg-slate-100 shadow-inner ${isNowPlaying ? 'w-24 h-24 sm:w-32 sm:h-32' : 'w-20 h-20 sm:w-24 sm:h-24'}`}>
          {imgLoading ? (
            <div className="w-full h-full animate-pulse bg-slate-200" />
          ) : artwork ? (
            <img src={artwork} alt="Capa" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <Music size={isNowPlaying ? 40 : 32} />
            </div>
          )}
        </div>
      </div>

      <div className="flex-grow min-w-0">
        <h3 className={`font-black uppercase truncate leading-tight ${isNowPlaying ? 'text-white text-xl sm:text-2xl' : 'text-slate-800 text-lg'}`}>
          {track.musica}
        </h3>
        <p className={`font-bold uppercase truncate ${isNowPlaying ? 'text-yellow-400 text-sm sm:text-base' : 'text-sky-500 text-sm'}`}>
          {track.artista}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Clock size={14} className={isNowPlaying ? 'text-white/40' : 'text-slate-400'} />
          <span className={`font-bold tabular-nums text-xs sm:text-sm ${isNowPlaying ? 'text-white/60' : 'text-slate-500'}`}>
            {track.hora} • {track.data}
          </span>
        </div>
      </div>

      {isNowPlaying && (
        <div className="hidden sm:block pr-4">
          <div className="bg-red-500 text-white px-3 py-1 rounded-full animate-pulse flex items-center gap-2">
            <Activity size={12} />
            <span className="text-[10px] font-black uppercase tracking-tighter">AO VIVO</span>
          </div>
        </div>
      )}
    </div>
  );
};

// --- APP PRINCIPAL ---
const App = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date: '', hour: '', search: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${CSV_URL}&t=${Date.now()}`);
      const text = await res.text();
      const lines = text.split('\n').filter(l => l.trim());
      
      const rows = lines.map(line => {
        const cells = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        return cells.map(c => c.replace(/^"|"$/g, '').trim());
      });

      if (rows.length < 2) return;

      // MAPEAMENTO INTELIGENTE DE COLUNAS
      const header = rows[0].map(h => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      const idxData = header.findIndex(h => h.includes('data') || h.includes('dia'));
      const idxHora = header.findIndex(h => h.includes('hora') || h.includes('time'));
      const idxArtista = header.findIndex(h => h.includes('artista') || h.includes('artist'));
      const idxMusica = header.findIndex(h => h.includes('musica') || h.includes('titulo') || h.includes('track'));

      const parsed = rows.slice(1).map((row, i) => ({
        id: `track-${i}`,
        data: row[idxData] || 'Sem Data',
        hora: (row[idxHora] || '').substring(0, 5),
        artista: row[idxArtista] || 'Desconhecido',
        musica: row[idxMusica] || 'Sem Título'
      }))
      .filter(t => t.artista !== 'Desconhecido') // Remove linhas vazias
      .sort((a, b) => `${b.data} ${b.hora}`.localeCompare(`${a.data} ${a.hora}`));

      setData(parsed);
      
      if (parsed.length > 0 && !filters.date) {
        setFilters(f => ({ ...f, date: parsed[0].data }));
      }
    } catch (e) {
      console.error("Erro no fetch:", e);
    } finally {
      setLoading(false);
    }
  }, [filters.date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredData = useMemo(() => {
    return data.filter(t => {
      const mDate = filters.date ? t.data === filters.date : true;
      const mHour = filters.hour ? t.hora.startsWith(filters.hour) : true;
      const mSearch = filters.search ? 
        (`${t.artista} ${t.musica}`).toLowerCase().includes(filters.search.toLowerCase()) : true;
      return mDate && mHour && mSearch;
    });
  }, [data, filters]);

  const exportPDF = () => {
    const doc = new jsPDF();
    const now = new Date().toLocaleDateString('pt-BR');
    
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("RELATÓRIO DE PLAYLIST - METROPOLITANA FM", 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Gerado em: ${now} | Filtro: ${filters.date || 'Geral'}`, 14, 30);
    
    let y = 45;
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(15, 23, 42);
    doc.rect(14, y - 5, 182, 8, 'F');
    doc.text("DATA", 16, y);
    doc.text("HORA", 45, y);
    doc.text("ARTISTA", 70, y);
    doc.text("MÚSICA", 130, y);

    doc.setTextColor(30, 41, 59);
    filteredData.forEach(t => {
      y += 8;
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(t.data, 16, y);
      doc.text(t.hora, 45, y);
      doc.text(t.artista.substring(0, 30), 70, y);
      doc.text(t.musica.substring(0, 35), 130, y);
      doc.setDrawColor(241, 245, 249);
      doc.line(14, y + 2, 196, y + 2);
    });
    
    const name = filters.date ? filters.date.replace(/\//g, '-') : 'Playlist_Geral';
    doc.save(`Relatorio_${name}.pdf`);
  };

  const uniqueDates = Array.from(new Set(data.map(d => d.data))).sort().reverse();

  return (
    <div className="min-h-screen pb-20 bg-[#F8FAFC]">
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-400 p-2.5 rounded-xl shadow-lg">
              <Radio className="text-white" size={24} />
            </div>
            <h1 className="font-black text-xl tracking-tighter">METROPOLITANA <span className="text-sky-500">FM</span></h1>
          </div>
          <button onClick={() => fetchData()} className="p-3 text-slate-400 hover:text-sky-500 transition-colors">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 mt-8">
        <section className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 mb-10 flex flex-col gap-4 border border-white">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
            <input 
              type="text" 
              placeholder="Pesquisar artista ou música..." 
              className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-xl border-none font-bold text-slate-700"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </div>
          
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500 pointer-events-none" size={18} />
              <select 
                className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-xl border-none font-bold text-slate-600 appearance-none cursor-pointer"
                value={filters.date}
                onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
              >
                <option value="">Todas Datas</option>
                {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="w-32 relative">
              <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500 pointer-events-none" size={18} />
              <select 
                className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-xl border-none font-bold text-slate-600 appearance-none cursor-pointer"
                value={filters.hour}
                onChange={e => setFilters(f => ({ ...f, hour: e.target.value }))}
              >
                <option value="">Hora</option>
                {Array.from({length: 24}).map((_, i) => (
                  <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
          </div>

          <button 
            onClick={exportPDF}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg"
          >
            <FileText size={18} /> Exportar Playlist PDF
          </button>
        </section>

        <div className="flex flex-col gap-4">
          {loading ? (
            <div className="py-20 text-center opacity-30">
              <Loader2 className="animate-spin mx-auto mb-4" size={40} />
              <p className="font-bold uppercase tracking-widest text-xs">Sincronizando dados...</p>
            </div>
          ) : filteredData.length > 0 ? (
            filteredData.map((t, idx) => (
              <MusicCard key={t.id} track={t} isNowPlaying={idx === 0 && !filters.search && !filters.hour} />
            ))
          ) : (
            <div className="bg-white p-12 rounded-[2rem] text-center border-2 border-dashed border-slate-200">
              <AlertCircle className="mx-auto text-slate-200 mb-2" size={48} />
              <p className="font-bold text-slate-400 uppercase text-xs tracking-widest">Nada encontrado</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
