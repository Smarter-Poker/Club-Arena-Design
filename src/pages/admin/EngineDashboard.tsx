import { useState, useEffect } from 'react';
import { cashGameOrchestrator } from '../../engine/CashGameOrchestrator';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/common/Toast';
import './EngineDashboard.css';

export default function EngineDashboard() {
  const [stats, setStats] = useState(cashGameOrchestrator.getStats());
  const [hydraStats, setHydraStats] = useState({ available: 0, seated: 0 });
  const toast = useToast();

  useEffect(() => {
    // Refresh stats every second
    const interval = setInterval(() => {
      setStats(cashGameOrchestrator.getStats());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadHydraStats();
    const interval = setInterval(loadHydraStats, 10000); // 10s refresh for Hydra
    return () => clearInterval(interval);
  }, []);

  const loadHydraStats = async () => {
    const { data: available, error: err1 } = await supabase
      .from('profiles')
      .select('id', { count: 'exact' })
      .eq('is_horse', true)
      .eq('horse_status', 'available');

    const { data: seated, error: err2 } = await supabase
      .from('profiles')
      .select('id', { count: 'exact' })
      .eq('is_horse', true)
      .eq('horse_status', 'seated');

    if (!err1 && !err2) {
      setHydraStats({
        available: available?.length || 0,
        seated: seated?.length || 0,
      });
    }
  };

  const handleToggleOrchestrator = async () => {
    try {
      if (stats.running) {
        await cashGameOrchestrator.stop();
        toast.info('Cash Game Orchestrator stopped. All tables halted.');
      } else {
        await cashGameOrchestrator.start();
        toast.success('Cash Game Orchestrator started! Engines spinning up.');
      }
      setStats(cashGameOrchestrator.getStats());
    } catch (err) {
      toast.error('Failed to toggle orchestrator');
    }
  };

  return (
    <div className="engine-dashboard">
      <header className="engine-header">
        <h1>⚙️ Global Matrix Orchestrator</h1>
        <p>Master Control Panel for the Smarter.Poker Cash Game & Hydra Engines</p>
      </header>

      <div className="engine-grid">
        <div className="engine-card">
          <div className="card-header">
            <h3>Cash Game Master Engine</h3>
            <span className={`status-badge ${stats.running ? 'online' : 'offline'}`}>
              {stats.running ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <p className="card-desc">
            Controls all HeadlessTableEngine instances globally. When online, active tables will
            automatically deal hands.
          </p>
          <div className="card-metrics">
            <div className="metric">
              <span className="label">Active Tables</span>
              <span className="value">{stats.activeTables}</span>
            </div>
            <div className="metric">
              <span className="label">Total Hands Dealt</span>
              <span className="value">{stats.totalHandsDealt.toLocaleString()}</span>
            </div>
          </div>
          <button
            className={`engine-btn ${stats.running ? 'btn-stop' : 'btn-start'}`}
            onClick={handleToggleOrchestrator}
          >
            {stats.running ? 'SHUTDOWN ENGINE' : 'IGNITE ENGINE'}
          </button>
        </div>

        <div className="engine-card">
          <div className="card-header">
            <h3>Hydra Fleet Command</h3>
            <span className={`status-badge ${stats.running ? 'online' : 'offline'}`}>
              {stats.running ? 'ACTIVE' : 'IDLE'}
            </span>
          </div>
          <p className="card-desc">
            Manages the 300+ Horse liquidity fleet. Automatically seeds empty tables and organically
            recedes when real players join.
          </p>
          <div className="card-metrics">
            <div className="metric">
              <span className="label">Available Horses</span>
              <span className="value">{hydraStats.available}</span>
            </div>
            <div className="metric">
              <span className="label">Seated Horses</span>
              <span className="value text-green">{hydraStats.seated}</span>
            </div>
          </div>
          <button className="engine-btn btn-secondary" disabled>
            Hydra is linked to Master Engine
          </button>
        </div>
      </div>
    </div>
  );
}
