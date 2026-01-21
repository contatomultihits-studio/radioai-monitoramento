import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Search, Calendar, Clock, Radio, 
  Music, Loader2, AlertCircle, Plus, Download, RefreshCw 
} from 'lucide-react';
import { jsPDF } from 'jspdf';

const SHEET_ID = '1xFRBBHpmn38TiBdZcwN2556811FKkfbEEB3HmmdxT1s';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
const REFRESH_INTERVAL_MS = 30000;

const MusicCard = ({ track, isNowPlaying }: { track: any, isNowPlaying: boolean }) => {
  const [artwork, setArtwork] = useState<string | null>(null);
  const [loadingCover, setLoadingCover] = useState(true);

  useEffect(() => {
    const fetchCover = async () => {
      const query = `${track.artista} ${track.musica}`.toLowerCase().trim();
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
        const data = await res.json();
        setArtwork(data.results?.[0]?.artworkUrl100 || null);
      } catch (e) {
        setArtwork(null);
      } finally {
        setLoadingCover(false);
      }
    };
    fetchCover();
  }, [track.artista, track.musica]);

  return (
    <div className={`flex items-center gap-4 p-5 rounded-[2rem] transition-all duration-300 ${isNowPlaying ? "bg-slate-900 border-l-8 border-yellow-400 shadow-2xl scale-[1.02] z-10" : "bg-white border border-slate-200 hover:shadow-lg"}`}>
      <div className={`relative flex-shrink-0 overflow-hidden rounded-2xl bg-slate-100 ${isNowPlaying ? 'w-24 h-24 sm:w-28 sm:h-28' : 'w-20 h-20'}`}>
        {loadingCover ? <div className="w-full h-full animate-pulse bg-slate-200 flex items-center justify-center"><Loader2 className="animate-spin text-slate-300" size={20} /></div> : artwork ? <img src={artwork.replace('100x100', '400x400')} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Music size={isNowPlaying ? 40 : 24} /></div>}
      </div>
      <div className="flex-grow min-w-0">
        {isNowPlaying && <div className="flex items-center gap-2 mb-2"><span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping"></span><span className="text-[10px] font-black text-white uppercase tracking-tighter">No Ar Agora</span></div>}
        <h3 className={`font-black uppercase truncate leading-tight text-lg ${isNowPlaying ? "text-white" : "text-slate-800"}`}>{track.musica}</h3>
        <p className={`font-bold uppercase truncate text-sm mb-2 ${isNowPlaying ? "text-yellow-400" : "text-sky-500"}`}>{track.artista}</p>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-[10px] ${isNowPlaying ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-500'}`}><Clock size={12} /> {track.hora}</div>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isNowPlaying ? 'text-white/40' : 'text-slate-400'}`}>{track.data}</span>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ date: '', search: '', radio: 'Metropolitana FM' });
  const [visibleCount, setVisibleCount] = useState(15);

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);
    try {
      const response = await fetch(`${CSV_URL}&cache_bust=${Date.now()}`);
      const csvText = await response.text();
      const rows = csvText.split(/\r?\n/).filter(line => line.trim() !== '').map(line => {
        const result = []; let cur = ''; let inQuotes = false;
        for (let char of line) { if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { result.push(cur.trim()); cur = ''; } else cur += char; }
        result.push(cur.trim()); return result;
      });

      const header = rows[0].map(h => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      const idxArtista = header.indexOf('artista'), idxMusica = header.indexOf('musica'), idxTocouEm = header.indexOf('tocou_em'), idxRadio = header.indexOf('radio');

      const formatted = rows.slice(1).map((row, i) => {
        let rawTime = row[idxTocouEm] || '';
        let dObj = new Date(rawTime);
        
        // Ajuste de Fuso Horário para Antena 1 (UTC para Brasília)
        if (row[idxRadio] === 'Antena 1' && rawTime.includes('T')) {
          dObj.setHours(dObj.getHours() - 3);
        }

        let finalDate = "";
        let finalTime = "";
        let timestamp = 0;

        // Tenta converter para data válida para ordenação
        if (!isNaN(dObj.getTime())) {
          finalDate = dObj.toISOString().split('T')[0];
          finalTime = dObj.toTimeString().substring(0, 5);
          timestamp = dObj.getTime();
        } else {
          // Se falhar (formato Metro), tenta quebrar o texto manualmente
          const parts = rawTime.split(' ');
          finalDate = parts[0] || "---";
          finalTime = parts[1]?.substring(0, 5) || "00:00";
          // Cria um timestamp manual para a Metro conseguir ordenar
          timestamp = new Date(rawTime.replace(/-/g, '/')).getTime() || 0;
        }

        return {
          id: `t-${i}`,
          artista: row[idxArtista] || 'Desconhecido',
          musica: row[idxMusica] || 'Sem Título',
          radio: row[idxRadio] || 'Metropolitana FM',
          data: finalDate,
          hora: finalTime,
          timestamp: timestamp
        };
      }).filter(t => t.artista !== 'artista' && t.musica !== 'musica');

      // ORDENAÇÃO POR DATA E HORA (O mais recente primeiro)
      const sorted = formatted.sort((a, b) => b.timestamp - a.timestamp);

      setData(sorted);
      if (sorted.length > 0 && !filters.date) {
        setFilters(prev => ({ ...prev, date: sorted[0].data }));
      }
    } catch (err: any) {
      if (!isSilent) setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters.date]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const interval = setInterval(() => fetchData(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredData = useMemo(() => {
    return data.filter(t => {
      const matchRadio = t.radio === filters.radio;
      const matchDate = filters.date ? t.data === filters.date : true;
      const matchSearch = filters.search ? (t.artista + t.musica).toLowerCase().includes(filters.search.toLowerCase()) : true;
      return matchRadio && matchDate && matchSearch;
    });
  }, [data, filters]);

  const uniqueDates = useMemo(() => [...new Set(data.filter(t => t.radio === filters.radio).map(d => d.data))].sort().reverse(), [data, filters.radio]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-400 p-2 rounded-xl text-white shadow-lg"><Radio size={24} /></div>
            <div>
              <h1 className="font-black text-xl tracking-tighter text-slate-900 leading-none uppercase">RÁDIO AI</h1>
              <p className="text-[10px] font-bold text-sky-500 uppercase tracking-[0.2em] mt-1">Monitoramento - {filters.radio}</p>
            </div>
          </div>
          <button onClick={() => fetchData()} className="p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-all">
            <RefreshCw className={`${refreshing ? 'animate-spin text-sky-500' : 'text-slate-400'}`} size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-white p-6 rounded-[2.5rem] shadow-xl mb-10 border border-slate-100">
          <div className="flex gap-2 mb-4 p-1 bg-slate-100 rounded-2xl">
            {['Metropolitana FM', 'Antena 1'].map(r => (
              <button key={r} onClick={() => { setFilters(f => ({ ...f, radio: r, date: '' })); setVisibleCount(15); }} className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase transition-all ${filters.radio === r ? 'bg-white shadow-md text-slate-900' : 'text-slate-400'}`}>{r}</button>
            ))}
          </div>
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
            <input type="text" placeholder="Pesquisar..." className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-2xl outline-none font-bold text-slate-700" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
          </div>
          <div className="flex-grow relative">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500" size={18} />
            <select className="w-full pl-12 pr-10 py-4 bg-slate-50 rounded-2xl font-bold text-slate-600 appearance-none outline-none" value={filters.date} onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}>
              <option value="">Selecione a Data</option>
              {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {loading ? <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-sky-400 mb-4" size={40} /><p className="font-bold text-slate-400 text-[10px]">SINCRONIZANDO...</p></div> : 
          filteredData.length > 0 ? (
            <>
              {filteredData.slice(0, visibleCount).map((track, idx) => <MusicCard key={track.id} track={track} isNowPlaying={idx === 0 && !filters.search} />)}
              {filteredData.length > visibleCount && <button onClick={() => setVisibleCount(c => c + 15)} className="w-full py-6 rounded-[2rem] border-2 border-dashed border-slate-200 text-slate-400 font-bold hover:bg-white transition-all uppercase text-[10px]"><Plus size={16} /> Carregar Mais</button>}
            </>
          ) : <div className="text-center py-20 bg-white rounded-[3rem] text-slate-300 font-black uppercase text-xs">Nenhum registro para {filters.radio}</div>}
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
