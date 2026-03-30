import { useState, useEffect } from 'react';
import { Database, HardDrive, LayoutGrid, TableProperties, Loader2, Activity } from 'lucide-react';
import { cn } from '../lib/utils';

type TableOverview = {
  name: string;
  rowCount: number;
};

type DBOverview = {
  database: string;
  size: string;
  tables: TableOverview[];
};

type TableData = {
  table: string;
  columns: { name: string; type: string }[];
  rows: any[];
};

export default function DatabasePage() {
  const [overview, setOverview] = useState<DBOverview | null>(null);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch overview on mount
  useEffect(() => {
    fetch('http://localhost:5000/api/database/overview')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch database overview');
        return res.json();
      })
      .then(data => {
        setOverview(data);
        if (data.tables.length > 0) {
          setActiveTable(data.tables[0].name);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Fetch specific table data when active table changes
  useEffect(() => {
    if (!activeTable) return;
    setTableLoading(true);
    
    fetch(`http://localhost:5000/api/database/table/${activeTable}`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch table ${activeTable}`);
        return res.json();
      })
      .then(data => {
        setTableData(data);
        setTableLoading(false);
      })
      .catch(err => {
        console.error(err);
        setTableLoading(false);
      });
  }, [activeTable]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-8">
        <div className="glass-card p-6 rounded-2xl border border-destructive/20 bg-destructive/5 text-destructive max-w-md w-full text-center">
          <Activity className="w-8 h-8 mx-auto mb-3" />
          <h3 className="text-lg font-bold">Database Connection Failed</h3>
          <p className="text-sm opacity-80 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background text-foreground">
      
      {/* ── Top Metric Strip ── */}
      <div className="shrink-0 px-8 py-6 border-b border-border bg-card/30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">PostgreSQL Explorer</h2>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Connected to <b>{overview.database}</b>
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="glass-card px-4 py-2.5 rounded-lg border border-border min-w-[140px]">
             <p className="text-[10px] text-muted-foreground uppercase font-semibold flex items-center gap-1.5 mb-1"><HardDrive className="w-3 h-3" /> Storage Used</p>
             <p className="text-xl font-bold font-mono">{overview.size}</p>
          </div>
          <div className="glass-card px-4 py-2.5 rounded-lg border border-border min-w-[140px]">
             <p className="text-[10px] text-muted-foreground uppercase font-semibold flex items-center gap-1.5 mb-1"><LayoutGrid className="w-3 h-3" /> Total Schemas</p>
             <p className="text-xl font-bold font-mono">{overview.tables.length} Tables</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Left Sidebar (Table List) ── */}
        <div className="w-64 shrink-0 border-r border-border bg-card/20 flex flex-col overflow-y-auto p-4 space-y-1">
           <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Public Schemas</p>
           {overview.tables.map(table => (
             <button
               key={table.name}
               onClick={() => setActiveTable(table.name)}
               className={cn(
                 "flex flex-col text-left px-3 py-2.5 rounded-lg transition-all w-full relative overflow-hidden group",
                 activeTable === table.name 
                   ? "bg-primary/10 border border-primary/20 text-primary" 
                   : "text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent"
               )}
             >
               {activeTable === table.name && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-lg" />}
               <div className="flex items-center gap-2 w-full">
                 <TableProperties className="w-3.5 h-3.5 shrink-0" />
                 <span className="text-sm font-semibold truncate">{table.name}</span>
               </div>
               <span className="text-[10px] opacity-70 mt-1 tabular-nums">{table.rowCount.toLocaleString()} rows</span>
             </button>
           ))}
        </div>

        {/* ── Main Data View ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background relative">
          
          {tableLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
               <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : null}

          {/* Table Header Details */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
             <div>
               <h3 className="text-base font-bold text-foreground font-mono">public.{activeTable}</h3>
               <p className="text-xs text-muted-foreground mt-0.5">Showing latest 100 entries</p>
             </div>
          </div>

          {/* Data Grid */}
          <div className="flex-1 overflow-auto p-6">
            {!tableData || tableData.rows.length === 0 ? (
              <div className="h-full w-full flex flex-col items-center justify-center border border-dashed border-border rounded-xl">
                 <TableProperties className="w-8 h-8 text-muted-foreground/50 mb-3" />
                 <p className="text-sm text-muted-foreground font-medium">Table is empty</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden rounded-b-none">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-secondary/80 text-muted-foreground text-xs uppercase sticky top-0 z-10 shadow-sm">
                    <tr>
                      {tableData.columns.map((col, i) => (
                        <th key={col.name} className={cn("px-4 py-3 font-semibold whitespace-nowrap border-b border-border/80", i > 0 && "border-l border-border/40")}>
                          {col.name} <span className="opacity-50 text-[9px] lowercase ml-1">{col.type}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50 bg-card/30">
                    {tableData.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-secondary/40 transition-colors">
                        {tableData.columns.map((col, cIndex) => {
                          let val = row[col.name];
                          
                          // Format special types
                          if (val === null) val = <span className="text-muted-foreground/50 italic">null</span>;
                          else if (typeof val === 'object') val = JSON.stringify(val);
                          else if (typeof val === 'boolean') val = val ? <span className="text-green-500 font-bold">true</span> : <span className="text-destructive font-bold">false</span>;
                          
                          // Handle precise dates
                          if (col.type === 'timestamp without time zone' && val) {
                              try { val = new Date(val as string).toLocaleString(); } catch { }
                          }

                          return (
                            <td key={col.name} className={cn("px-4 py-2.5 font-mono text-xs whitespace-nowrap", cIndex > 0 && "border-l border-border/20")}>
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
