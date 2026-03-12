/**
 *  CLUB SETTINGS PAGE — Club Configuration
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';
import { ClubsService } from '../services/ClubsService';
import { useUserStore } from '../stores/useUserStore';
import { useToast } from '../components/common/Toast';
import { sanitizeInput } from '../utils/sanitizeInput';
import PageSkeleton from '../components/common/PageSkeleton';
import ClubBottomNav from '../components/club/ClubBottomNav';
import AuditLog from '../components/admin/AuditLog';
import { StatsExport } from '../components/admin/StatsExport';
import { useVisibilityRefresh } from '../hooks/useVisibilityRefresh';
import '../components/common/ButtonSpinner.css';
import './ClubSettingsPage.css';

interface ClubSettings {
  name: string;
  description: string;
  is_public: boolean;
  requires_approval: boolean;
  default_rake_percent: number;
  rake_cap: number;
  time_bank_seconds: number;
  allow_straddle: boolean;
  allow_run_it_twice: boolean;
  allow_rabbit_hunt: boolean;
  min_buyin_bb: number;
  max_buyin_bb: number;
}

export default function ClubSettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { clubId: routeClubId } = useParams();
  const clubId = routeClubId || searchParams.get('club') || undefined;
  const { user } = useUserStore();
  const toast = useToast();

  const [settings, setSettings] = useState<ClubSettings>({
    name: '',
    description: '',
    is_public: true,
    requires_approval: false,
    default_rake_percent: 5,
    rake_cap: 3,
    time_bank_seconds: 30,
    allow_straddle: true,
    allow_run_it_twice: true,
    allow_rabbit_hunt: true,
    min_buyin_bb: 40,
    max_buyin_bb: 200,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStatsExport, setShowStatsExport] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'agent' | 'member'>('member');
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (clubId) loadClubSettings();
  }, [clubId]);

  // Section entrance animation
  useEffect(() => {
    if (!loading) {
      const sections = ['basic', 'gameplay', 'advanced', 'danger'];
      sections.forEach((section, index) => {
        setTimeout(() => {
          setVisibleSections((prev) => new Set(prev).add(section));
        }, index * 80);
      });
    }
  }, [loading]);

  // ── Realtime: live club settings changes ──
  useEffect(() => {
    if (!clubId) return;
    const channelKey = `club-settings-${clubId}`;
    const channel = masterBus.getOrCreateChannel(channelKey);
    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'clubs',
          filter: `id=eq.${clubId}`,
        },
        () => {
          loadClubSettings();
        }
      )
      .subscribe();
    return () => {
      masterBus.removeRegisteredChannel(channelKey);
    };
  }, [clubId]);

  // ── Bus Listeners: cross-page event reactivity ──
  useEffect(() => {
    const unsubJoined = masterBus.subscribe('CLUB_JOINED', () => {
      loadClubSettings();
    });
    const unsubLeft = masterBus.subscribe('CLUB_LEFT', () => {
      loadClubSettings();
    });
    return () => {
      unsubJoined();
      unsubLeft();
    };
  }, []);

  const loadClubSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .maybeSingle();

      if (!error && data) {
        setSettings({
          name: data.name || '',
          description: data.description || '',
          is_public: data.is_public ?? true,
          requires_approval: data.requires_approval ?? false,
          default_rake_percent: data.default_rake_percent || 5,
          rake_cap: data.rake_cap || 3,
          time_bank_seconds: data.time_bank_seconds || 30,
          allow_straddle: data.allow_straddle ?? true,
          allow_run_it_twice: data.allow_run_it_twice ?? true,
          allow_rabbit_hunt: data.allow_rabbit_hunt ?? true,
          min_buyin_bb: data.min_buyin_bb || 40,
          max_buyin_bb: data.max_buyin_bb || 200,
        });
        setIsOwner(data.owner_id === user?.id);
      }
    } catch (error) {
      console.error('Failed to load club settings:', error);
      toast.error('Failed to load club settings');
    }
    setLoading(false);
  };

  const saveSettings = async () => {
    if (!isOwner) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('clubs')
        .update({
          name: sanitizeInput(settings.name),
          description: sanitizeInput(settings.description),
          is_public: settings.is_public,
          requires_approval: settings.requires_approval,
          default_rake_percent: settings.default_rake_percent,
          rake_cap: settings.rake_cap,
          time_bank_seconds: settings.time_bank_seconds,
          allow_straddle: settings.allow_straddle,
          allow_run_it_twice: settings.allow_run_it_twice,
          allow_rabbit_hunt: settings.allow_rabbit_hunt,
          min_buyin_bb: settings.min_buyin_bb,
          max_buyin_bb: settings.max_buyin_bb,
        })
        .eq('id', clubId);

      if (!error) {
        toast.success('Settings saved!');
        masterBus.emit('SETTINGS_UPDATED', { settings: { clubId, ...settings } });
        if (clubId) masterBus.emit('CLUB_UPDATED', { clubId });
        navigate(`/clubs/${clubId}`);
      } else {
        toast.error('Failed to save settings: ' + error.message);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    }
    setSaving(false);
  };

  const updateSetting = <K extends keyof ClubSettings>(key: K, value: ClubSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleDeleteClub = async () => {
    if (!clubId || confirmText !== settings.name) return;

    setIsDeleting(true);
    try {
      await ClubsService.delete(clubId);
      toast.success('Club deleted successfully');
      navigate('/clubs');
    } catch (error: unknown) {
      console.error('Failed to delete club:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete club');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (loading) {
    return (
      <div className="club-settings-page">
        <PageSkeleton variant="settings" />
      </div>
    );
  }

  return (
    <div className="club-settings-page">
      <div className="settings-content">
        {/* Basic Info */}
        <section className="settings-section">
          <h3>Basic Information</h3>
          <div className="form-group">
            <label>Club Name</label>
            <input
              type="text"
              value={settings.name}
              onChange={(e) => updateSetting('name', e.target.value)}
              disabled={!isOwner}
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={settings.description}
              onChange={(e) => updateSetting('description', e.target.value)}
              rows={3}
              disabled={!isOwner}
            />
          </div>
        </section>

        {/* Privacy */}
        <section className="settings-section">
          <h3>Privacy</h3>
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label">Public Club</span>
              <span className="toggle-desc">Anyone can find and request to join</span>
            </div>
            <button
              className={`toggle-btn ${settings.is_public ? 'on' : ''}`}
              onClick={() => updateSetting('is_public', !settings.is_public)}
              disabled={!isOwner}
            >
              {settings.is_public ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label">Require Approval</span>
              <span className="toggle-desc">Manually approve new members</span>
            </div>
            <button
              className={`toggle-btn ${settings.requires_approval ? 'on' : ''}`}
              onClick={() => updateSetting('requires_approval', !settings.requires_approval)}
              disabled={!isOwner}
            >
              {settings.requires_approval ? 'ON' : 'OFF'}
            </button>
          </div>
        </section>

        {/* Game Rules */}
        <section className="settings-section">
          <h3>Game Rules</h3>
          <div className="form-group">
            <label>Default Rake (%)</label>
            <input
              type="number"
              value={settings.default_rake_percent}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                updateSetting('default_rake_percent', isNaN(val) ? 0 : val);
              }}
              min={0}
              max={10}
              step={0.5}
              disabled={!isOwner}
            />
          </div>
          <div className="form-group">
            <label>Rake Cap (BB)</label>
            <input
              type="number"
              value={settings.rake_cap}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                updateSetting('rake_cap', isNaN(val) ? 0 : val);
              }}
              min={1}
              max={10}
              step={0.5}
              disabled={!isOwner}
            />
          </div>
          <div className="form-group">
            <label>Time Bank (seconds)</label>
            <input
              type="number"
              value={settings.time_bank_seconds}
              onChange={(e) => updateSetting('time_bank_seconds', parseInt(e.target.value) || 0)}
              min={15}
              max={120}
              disabled={!isOwner}
            />
          </div>
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label">Allow Straddle</span>
            </div>
            <button
              className={`toggle-btn ${settings.allow_straddle ? 'on' : ''}`}
              onClick={() => updateSetting('allow_straddle', !settings.allow_straddle)}
              disabled={!isOwner}
            >
              {settings.allow_straddle ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label">Run It Twice</span>
            </div>
            <button
              className={`toggle-btn ${settings.allow_run_it_twice ? 'on' : ''}`}
              onClick={() => updateSetting('allow_run_it_twice', !settings.allow_run_it_twice)}
              disabled={!isOwner}
            >
              {settings.allow_run_it_twice ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label">Rabbit Hunt</span>
            </div>
            <button
              className={`toggle-btn ${settings.allow_rabbit_hunt ? 'on' : ''}`}
              onClick={() => updateSetting('allow_rabbit_hunt', !settings.allow_rabbit_hunt)}
              disabled={!isOwner}
            >
              {settings.allow_rabbit_hunt ? 'ON' : 'OFF'}
            </button>
          </div>
        </section>

        {/* Buy-in Limits */}
        <section className="settings-section">
          <h3>Buy-in Limits</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Min (BB)</label>
              <input
                type="number"
                value={settings.min_buyin_bb}
                onChange={(e) => updateSetting('min_buyin_bb', parseInt(e.target.value) || 0)}
                min={20}
                max={100}
                disabled={!isOwner}
              />
            </div>
            <div className="form-group">
              <label>Max (BB)</label>
              <input
                type="number"
                value={settings.max_buyin_bb}
                onChange={(e) => updateSetting('max_buyin_bb', parseInt(e.target.value) || 0)}
                min={100}
                max={1000}
                disabled={!isOwner}
              />
            </div>
          </div>
        </section>

        {/* Audit Log - Admin Activity */}
        {isOwner && clubId && (
          <section className="settings-section audit-section">
            <h3>Admin Activity Log</h3>
            <AuditLog clubId={clubId} />
          </section>
        )}

        {/* Data Export - Owner Only */}
        {isOwner && (
          <section className="settings-section export-section">
            <h3>📊 Data Export</h3>
            <div className="export-item">
              <div className="export-info">
                <span className="export-label">Export Club Stats</span>
                <span className="export-desc">
                  Download player stats, hand histories, and club analytics.
                </span>
              </div>
              <button className="btn btn-secondary" onClick={() => setShowStatsExport(true)}>
                📥 Export Stats
              </button>
            </div>
          </section>
        )}

        {/* Danger Zone - Owner Only */}
        {isOwner && (
          <section className="settings-section danger-zone">
            <h3> Danger Zone</h3>
            <div className="danger-item">
              <div className="danger-info">
                <span className="danger-label">Delete this club</span>
                <span className="danger-desc">
                  Once deleted, all club data, members, and tables will be permanently removed.
                </span>
              </div>
              <button className="btn btn-danger" onClick={() => setShowDeleteModal(true)}>
                Delete Club
              </button>
            </div>
          </section>
        )}

        {isOwner && (
          <button className="btn btn-primary save-btn" onClick={saveSettings} disabled={saving}>
            {saving ? <><span className="btn-spinner" /> Saving...</> : 'Save Changes'}
          </button>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content delete-modal" onClick={(e) => e.stopPropagation()}>
            <h3> Delete Club</h3>
            <p>
              This action <strong>cannot be undone</strong>. This will permanently delete the club{' '}
              <strong>{settings.name}</strong> and remove all members.
            </p>
            <div className="form-group">
              <label>Type the club name to confirm:</label>
              <input
                type="text"
                placeholder={settings.name}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowDeleteModal(false);
                  setConfirmText('');
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteClub}
                disabled={confirmText !== settings.name || isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Club'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Export Modal */}
      <StatsExport
        clubId={clubId}
        isOpen={showStatsExport}
        onClose={() => setShowStatsExport(false)}
      />

      {clubId && <ClubBottomNav clubId={clubId} userRole={userRole} />}
    </div>
  );
}
