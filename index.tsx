diff --git a/index.tsx b/index.tsx
index e566b35431f12471e153e2ffa923eca3ccd9aebe..8dbe2edb9ab238f6d2afd4372de752fc3f4b4e8d 100644
--- a/index.tsx
+++ b/index.tsx
@@ -45,50 +45,51 @@ const MusicCard = ({ track, isNowPlaying }: { track: any, isNowPlaying: boolean
       <div className="flex-grow min-w-0">
         {isNowPlaying && (
           <div className="flex items-center gap-2 mb-2">
             <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping"></span>
             <span className="text-[10px] font-black text-white uppercase tracking-tighter">No Ar Agora</span>
           </div>
         )}
         <h3 className={`font-black uppercase truncate leading-tight text-lg ${isNowPlaying ? "text-white" : "text-slate-800"}`}>{track.musica}</h3>
         <p className={`font-bold uppercase truncate text-sm mb-2 ${isNowPlaying ? "text-yellow-400" : "text-sky-500"}`}>{track.artista}</p>
         <div className="flex items-center gap-3">
           <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-bold tabular-nums text-[10px] ${isNowPlaying ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-500'}`}><Clock size={12} /> {track.hora}</div>
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
+  const [exportHour, setExportHour] = useState('all');
 
   const fetchData = useCallback(async (isSilent = false) => {
     if (!isSilent) setLoading(true);
     setRefreshing(true);
     try {
       const response = await fetch(`${CSV_URL}&cache_bust=${Date.now()}`);
       const csvText = await response.text();
       const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
       const rows = lines.map(line => {
         const result = []; let cur = ''; let inQuotes = false;
         for (let char of line) { if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { result.push(cur.trim()); cur = ''; } else cur += char; }
         result.push(cur.trim()); return result;
       });
 
       const header = rows[0].map(h => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
       const idxArt = header.indexOf('artista'), idxMus = header.indexOf('musica'), idxTim = header.indexOf('tocou_em'), idxRad = header.indexOf('radio');
 
       const formatted = rows.slice(1).map((row, i) => {
         const rawTime = row[idxTim] || '';
         const normalizedTime = rawTime.replace(/-/g, '/');
         let dObj = new Date(normalizedTime);
         if (isNaN(dObj.getTime())) dObj = new Date(rawTime);
         
         // Ajuste Fuso Antena 1
         if (row[idxRad] === 'Antena 1' && rawTime.includes('T')) dObj.setHours(dObj.getHours() - 3);
@@ -122,79 +123,110 @@ const App = () => {
     } catch (err: any) { if (!isSilent) setError(err.message); } finally { setLoading(false); setRefreshing(false); }
   }, [filters.date]);
 
   useEffect(() => { fetchData(); }, [fetchData]);
   useEffect(() => {
     const interval = setInterval(() => fetchData(true), REFRESH_INTERVAL_MS);
     return () => clearInterval(interval);
   }, [fetchData]);
 
   // FILTRO OBRIGATÓRIO POR RÁDIO
   const filteredData = useMemo(() => {
     return data.filter(t => {
       // SÓ MOSTRA SE A RÁDIO DA LINHA FOR IGUAL À RÁDIO SELECIONADA NO BOTÃO
       const matchRadio = t.radio.trim() === filters.radio.trim();
       const matchDate = filters.date ? t.data === filters.date : true;
       const matchSearch = filters.search ? (t.artista + t.musica).toLowerCase().includes(filters.search.toLowerCase()) : true;
       return matchRadio && matchDate && matchSearch;
     });
   }, [data, filters]);
 
   const uniqueDates = useMemo(() => {
     const dates = data.filter(t => t.radio === filters.radio).map(d => d.data);
     return [...new Set(dates)].sort().reverse();
   }, [data, filters.radio]);
 
+  const hourOptions = useMemo(() => {
+    return Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
+  }, []);
+
   const exportPDF = () => {
+    const exportRows = filteredData.filter(t => {
+      if (exportHour === 'all') return true;
+      return t.hora.startsWith(`${exportHour}:`);
+    });
+
+    if (exportRows.length === 0) {
+      alert('Nenhum registro encontrado para o horário selecionado.');
+      return;
+    }
+
     const doc = new jsPDF();
     doc.setFontSize(18);
     doc.text(`RELATÓRIO DE MONITORAMENTO - ${filters.radio}`, 14, 20);
     doc.setFontSize(10);
-    doc.text(`Data: ${filters.date} | Gerado em: ${new Date().toLocaleString()}`, 14, 28);
-    let y = 40; doc.setFont("helvetica", "bold"); doc.text("HORA", 14, y); doc.text("ARTISTA", 40, y); doc.text("MÚSICA", 100, y);
-    doc.line(14, y + 2, 196, y + 2); doc.setFont("helvetica", "normal");
-    filteredData.slice(0, 100).forEach(t => {
-      y += 8; if (y > 280) { doc.addPage(); y = 20; }
+    const hourLabel = exportHour === 'all' ? 'Todas as horas' : `${exportHour}:00`;
+    doc.text(`Data: ${filters.date} | Hora: ${hourLabel} | Gerado em: ${new Date().toLocaleString()}`, 14, 28);
+
+    let y = 40;
+    const renderHeader = () => {
+      doc.setFont("helvetica", "bold");
+      doc.text("HORA", 14, y);
+      doc.text("ARTISTA", 40, y);
+      doc.text("MÚSICA", 100, y);
+      doc.line(14, y + 2, 196, y + 2);
+      doc.setFont("helvetica", "normal");
+    };
+
+    renderHeader();
+    exportRows.forEach(t => {
+      y += 8;
+      if (y > 280) {
+        doc.addPage();
+        y = 20;
+        renderHeader();
+      }
       doc.text(t.hora, 14, y); doc.text(t.artista.substring(0, 30), 40, y); doc.text(t.musica.substring(0, 45), 100, y);
     });
     doc.save(`Playlist_${filters.radio}_${filters.date}.pdf`);
   };
 
   return (
     <div className="min-h-screen bg-slate-50">
       <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
         <div className="max-w-3xl mx-auto px-6 h-20 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="bg-yellow-400 p-2 rounded-xl text-white shadow-lg"><Radio size={24} /></div>
             <div>
               <h1 className="font-black text-xl tracking-tighter text-slate-900 leading-none uppercase">RÁDIO AI</h1>
               <p className="text-[10px] font-bold text-sky-500 uppercase tracking-[0.2em] mt-1">{filters.radio}</p>
             </div>
           </div>
           <button onClick={() => fetchData()} className="p-3 bg-slate-50 rounded-xl hover:bg-slate-100"><RefreshCw className={refreshing ? 'animate-spin text-sky-500' : 'text-slate-400'} size={20} /></button>
         </div>
       </header>
 
       <main className="max-w-3xl mx-auto px-6 py-10">
         <div className="bg-white p-6 rounded-[2.5rem] shadow-xl mb-10 border border-slate-100">
           <div className="flex gap-2 mb-4 p-1 bg-slate-100 rounded-2xl">
             {['Metropolitana FM', 'Antena 1'].map(r => (
               <button key={r} onClick={() => { setFilters(f => ({ ...f, radio: r, date: '' })); setVisibleCount(15); }} className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase transition-all ${filters.radio === r ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>{r}</button>
             ))}
           </div>
           <div className="relative mb-4"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} /><input type="text" placeholder="Pesquisar..." className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-2xl outline-none font-bold text-slate-700" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} /></div>
-          <div className="relative"><Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500" size={18} /><select className="w-full pl-12 pr-10 py-4 bg-slate-50 rounded-2xl font-bold text-slate-600 appearance-none outline-none" value={filters.date} onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}>{uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
+          <div className="relative mb-4"><Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500" size={18} /><select className="w-full pl-12 pr-10 py-4 bg-slate-50 rounded-2xl font-bold text-slate-600 appearance-none outline-none" value={filters.date} onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}>{uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
+          <div className="relative"><Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500" size={18} /><select className="w-full pl-12 pr-10 py-4 bg-slate-50 rounded-2xl font-bold text-slate-600 appearance-none outline-none" value={exportHour} onChange={e => setExportHour(e.target.value)}><option value="all">Todas as horas</option>{hourOptions.map(h => <option key={h} value={h}>{h}:00</option>)}</select></div>
           <button onClick={exportPDF} className="w-full mt-4 py-4 bg-yellow-400 hover:bg-yellow-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 transition-all shadow-lg active:scale-95"><Download size={18} /> Exportar Playlist PDF</button>
         </div>
         <div className="space-y-4">
           {loading ? <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-sky-400 mb-4" size={40} /><p className="font-bold text-slate-400 text-[10px] uppercase">Sincronizando...</p></div> : 
           filteredData.length > 0 ? (
             <>{filteredData.slice(0, visibleCount).map((track, idx) => <MusicCard key={track.id} track={track} isNowPlaying={idx === 0 && !filters.search} />)}{filteredData.length > visibleCount && <button onClick={() => setVisibleCount(c => c + 15)} className="w-full py-6 rounded-[2rem] border-2 border-dashed border-slate-200 text-slate-400 font-bold hover:bg-white transition-all uppercase text-[10px] tracking-widest"><Plus size={16} /> Carregar Mais</button>}</>
           ) : <div className="bg-white p-20 rounded-[3rem] text-center border-4 border-dashed border-slate-100"><p className="font-black text-slate-300 uppercase text-xs tracking-widest">Nenhum registro para {filters.radio}</p></div>}
         </div>
       </main>
     </div>
   );
 };
 
 const root = createRoot(document.getElementById('root')!);
 root.render(<App />);
