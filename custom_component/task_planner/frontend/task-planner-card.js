import {

  LitElement,

  html,
  css,
} from 'https://unpkg.com/lit@2.7.6/index.js?module';

// Fanfare Sound Setup
if (!window.taskCompleteSound) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  window.taskCompleteSound = {
    play: () => {
      const now = audioContext.currentTime;
      
      // Create oscillators and gain nodes for fanfare
      const oscillators = Array(3).fill().map(() => audioContext.createOscillator());
      const gains = Array(3).fill().map(() => audioContext.createGain());
      
      // Connect all nodes
      oscillators.forEach((osc, i) => {
        osc.connect(gains[i]);
        gains[i].connect(audioContext.destination);
      });
      
      // Fanfare frequencies (C4, E4, G4 -> C5)
      const frequencies = [261.63, 329.63, 523.25];
      
      // Configure tones
      oscillators.forEach((osc, i) => {
        osc.type = 'square'; 
        osc.frequency.setValueAtTime(frequencies[i], now);
        
        gains[i].gain.setValueAtTime(0, now);
        gains[i].gain.linearRampToValueAtTime(0.1, now + i * 0.08);
        gains[i].gain.linearRampToValueAtTime(0.1, now + 0.2 + i * 0.08);
        gains[i].gain.linearRampToValueAtTime(0, now + 0.3 + i * 0.08);
        
        osc.start(now + i * 0.08);
        osc.stop(now + 0.4 + i * 0.08);
      });

      // Add final chord
      const finalOsc = audioContext.createOscillator();
      const finalGain = audioContext.createGain();
      finalOsc.connect(finalGain);
      finalGain.connect(audioContext.destination);
      
      finalOsc.type = 'square';
      finalOsc.frequency.setValueAtTime(523.25, now + 0.3);
      
      finalGain.gain.setValueAtTime(0, now + 0.3);
      finalGain.gain.linearRampToValueAtTime(0.15, now + 0.35);
      finalGain.gain.linearRampToValueAtTime(0, now + 0.5);
      
      finalOsc.start(now + 0.3);
      finalOsc.stop(now + 0.5);
    }
  };
}

// Ensure confetti is loaded only once
if (!window.confettiLoaded) {
  const confettiScript = document.createElement('script');
  confettiScript.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
  confettiScript.async = true;
  document.head.appendChild(confettiScript);
  window.confettiLoaded = true;
}
class TaskPlannerCard extends LitElement {
  static get properties() {
    return {
      _hass: { type: Object },
      _config: { type: Object },
      _selectedDay: { type: Number, state: true },
      _taskConfig: { type: Object, state: true }, 
      _activeUsers: { type: Array, state: true }
    };
  }
  
  constructor() {
    super();
    this._selectedDay = new Date().getDay();
    this._taskConfig = null;
    this._hass = null;
    this._config = null;
    this._activeUsers = [];
  }

  setConfig(config) {
    this._config = config;
    // Parse active users from config, defaulting to all users if not specified
    this._activeUsers = config.ActiveUser ? 
      (Array.isArray(config.ActiveUser) ? config.ActiveUser : [config.ActiveUser]) : 
      null;
    this.requestUpdate();
  }

  set hass(hass) {
    const firstSet = !this._hass;
    this._hass = hass;
    
    if (firstSet) {
      this._loadConfigFromHA();
    }
  }

  _sanitizeId(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(" ", "_")
      .replace(/[äöüß]/g, match => ({
        'ä': 'ae',
        'ö': 'oe',
        'ü': 'ue',
        'ß': 'ss'
      })[match])
      .replace(/[^a-z0-9_]/g, '');
  }
  
  async _loadConfigFromHA() {
    if (!this._hass) return;

    try {
      const users = new Map();
      const taskEntities = Object.entries(this._hass.states)
        .filter(([entityId]) => entityId.startsWith('task_planner.') 
          && !entityId.endsWith('_stars') 
          && !entityId.endsWith('_role'));
    
      
      for (const [entityId, state] of taskEntities) {
        const parts = entityId.split('.');
        const userTaskParts = parts[1].split('_');
        const userName = userTaskParts[0];
        
        if (!users.has(userName)) {
          const roleEntity = this._hass.states[`task_planner.${userName}_role`];
          users.set(userName, {
            name: userName.charAt(0).toUpperCase() + userName.slice(1),
            role: roleEntity?.state || 'User',
            usericon: roleEntity?.attributes?.icon || 'mdi:account',
            tasks: []
          });
        }

        const user = users.get(userName);
        
        const taskConfig = {
          name: state.attributes?.friendly_name?.split(' - ')[1] || userTaskParts.slice(1).join('_'),
          icon: state.attributes?.icon,  // Nutze das Icon aus den Attributen
          days: state.attributes?.days || [1,2,3,4,5],
          color: state.attributes?.color || 'blue',
          description: state.attributes?.description || '',
          entityId: entityId
        };
        
        user.tasks.push(taskConfig);
      }

      this._taskConfig = {
        users: Array.from(users.values())
      };

      // Filter users if specific active users are specified
      if (this._activeUsers) {
        this._taskConfig.users = this._taskConfig.users.filter(user => 
          this._activeUsers.some(activeUser => 
            activeUser.toLowerCase() === user.name.toLowerCase()
          )
        );
      }
      
      this.requestUpdate();

    } catch (error) {
      console.error('Error loading config from HA:', error);
      this._taskConfig = { users: [] };
    }
  }
  

  _getRewards(userName) {
    try {
      const entityId = `task_planner.${this._sanitizeId(userName)}_stars`;
      const stars = parseInt(this._hass.states[entityId]?.state || '0');
      
      return {
        medals: Math.floor(stars / 30),
        trophies: Math.floor((stars % 30) / 10),
        stars: stars % 10,
        total: stars
      };
    } catch (error) {
      console.error('Error in _getRewards:', error);
      return { medals: 0, trophies: 0, stars: 0, total: 0 };
    }
  }

  _isTaskCompletedToday(entityId) {
    try {
      const state = this._hass.states[entityId];
      if (!state) return false;

      return state.state === "on";
    } catch (error) {
      return false;
    }
  }

  _showNotification(message) {
    // Zeige eine Home Assistant Benachrichtigung
    this._hass.callService('persistent_notification', 'create', {
      title: 'Aufgaben-Planer',
      message: message
    });
  }
  
  async _handleTaskClick(user, task) {
    if (!this._hass) return;

    // Überprüfe den aktuell angemeldeten Benutzer
    // const currentUser = this._hass.user.name;
    //if (currentUser.toLowerCase() !== user.name.toLowerCase()) {
      // Zeige eine Benachrichtigung, wenn der falsche Benutzer angemeldet ist
      //this._showNotification(`Nur ${user.name} kann diese Aufgaben abschließen.`);
      //return;
    //}
    
    const currentDay = new Date().getDay();
    if (this._selectedDay !== currentDay) return;

    try {
      const entityId = task.entityId;
      const entityState = this._hass.states[entityId];
      
      if (!entityState || entityState.state === "on") return;

      window.taskCompleteSound?.play();
      this._fireConfetti();

      // Toggle state
      await this._hass.callService("task_planner", "turn_on", {
        entity_id: entityId
      });

      // Update stars
      const starsEntityId = `task_planner.${this._sanitizeId(user.name)}_stars`;
      const currentStars = parseInt(this._hass.states[starsEntityId]?.state || '0');
      
      await this._hass.callService("task_planner", "set_stars", {
        entity_id: starsEntityId,
        value: currentStars + 1
      });

      this.requestUpdate();
    } catch (error) {
      console.error('Error in _handleTaskClick:', error);
    }
  }

  _getDayName(day) {
    const days = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    return days[day] || "Unbekannter Tag";
  }

  _renderDaySelector() {
    const currentDay = new Date().getDay();
    
    return html`
      <div class="day-selector">
        ${[0, 1, 2, 3, 4, 5, 6].map(day => html`
          <button
            class="day-button ${day === this._selectedDay ? 'selected' : ''}"
            @click=${() => {
              this._selectedDay = day;
              this.requestUpdate();
            }}
          >
            ${this._getDayName(day)}
            ${day === currentDay ? html`<span class="today-marker">heute</span>` : ''}
          </button>
        `)}
      </div>
    `;
  }

  _renderRewards(user) {
    const rewards = this._getRewards(user.name);
    
    return html`
      <div class="rewards-container">
        <ha-dialog 
          id="rewards-dialog-${this._sanitizeId(user.name)}"
          .heading=${html`Belohnung für ${user.name}`}
        >
          <div slot="content">
            <p>Möchtest du deine gesammelten Sterne (${rewards.total}) wirklich einlösen?</p>
            <div class="reward-breakdown">
              ${rewards.medals > 0 ? html`
                <div>
                  <ha-icon class="medal" icon="mdi:medal"></ha-icon>
                  Medaillen: ${rewards.medals}
                </div>
              ` : ''}
              
              ${rewards.trophies > 0 ? html`
                <div>
                  <ha-icon class="trophy" icon="mdi:trophy"></ha-icon>
                  Trophäen: ${rewards.trophies}
                </div>
              ` : ''}
              
              ${rewards.stars > 0 ? html`
                <div>
                  <ha-icon class="star" icon="mdi:star"></ha-icon>
                  Sterne: ${rewards.stars}
                </div>
              ` : ''}
            </div>
          </div>
          
          <mwc-button 
            slot="primaryAction" 
            dialogAction="cancel"
          >
            Abbrechen
          </mwc-button>
          
          <mwc-button 
            slot="secondaryAction" 
            @click=${() => this._redeemRewards(user.name)}
          >
            Einlösen
          </mwc-button>
        </ha-dialog>

        <div 
          class="rewards-trigger" 
          @click=${() => this._openRewardsDialog(user.name)}
        >
          ${rewards.medals > 0 ? html`
            <div class="reward-group">
              <ha-icon class="medal" icon="mdi:medal"></ha-icon>
              <span class="reward-count">${rewards.medals}</span>
            </div>
          ` : ''}
          
          ${rewards.trophies > 0 ? html`
            <div class="reward-group">
              <ha-icon class="trophy" icon="mdi:trophy"></ha-icon>
              <span class="reward-count">${rewards.trophies}</span>
            </div>
          ` : ''}
          
          ${rewards.stars > 0 ? html`
            <div class="reward-group">
              <ha-icon class="star" icon="mdi:star"></ha-icon>
              <span class="reward-count">${rewards.stars}</span>
            </div>
          ` : ''}
          
          <div class="reward-total">
            <span class="reward-count">Gesamt: ${rewards.total}</span>
          </div>
        </div>
      </div>
    `;
  }

  _openRewardsDialog(userName) {
    const dialogId = `rewards-dialog-${this._sanitizeId(userName)}`;
    const dialog = this.renderRoot.querySelector(`#${dialogId}`);
    if (dialog) {
      dialog.open = true;
    }
  }

  async _redeemRewards(userName) {
    if (!this._hass) return;

    try {
      const starsEntityId = `task_planner.${this._sanitizeId(userName)}_stars`;
      
      // Setze Sterne auf 0
      await this._hass.callService("task_planner", "set_stars", {
        entity_id: starsEntityId,
        value: 0
      });

      this.requestUpdate();
    } catch (error) {
      console.error('Fehler beim Einlösen der Belohnungen:', error);
    }
  }


  _renderTasks(user) {
    const currentDay = new Date().getDay();
    const tasksForDay = user.tasks.filter(task => 
      Array.isArray(task.days) && task.days.includes(this._selectedDay)
    );

    if (tasksForDay.length === 0) {
      return html`
        <div class="no-tasks">
          Keine Aufgaben für ${this._getDayName(this._selectedDay)}
        </div>
      `;
    }

    return tasksForDay.map(task => {
      const isCompleted = this._isTaskCompletedToday(task.entityId);
      const isCurrentDay = this._selectedDay === currentDay;
      
      if (isCompleted && isCurrentDay) return '';

      const isDisabled = !isCurrentDay;

      return html`
        <div 
          class="task-card ${isDisabled ? 'disabled' : ''}"
          style="background-color: var(--task-${task.color}-bg); color: var(--task-${task.color}-text)"
          @click=${() => !isDisabled && this._handleTaskClick(user, task)}
        >
          <div class="task-header">
            <ha-icon icon="${task.icon}"></ha-icon>
            <span class="task-title">${task.name}</span>
          </div>
          ${task.description ? html`
            <div class="task-description">${task.description}</div>
          ` : ''}
          ${isDisabled ? html`
            <div class="disabled-notice">Nur heute abschließbar</div>
          ` : ''}
        </div>
      `;
    });
  }

  _fireConfetti() {
    if (window.confetti) {
      const count = 200;
      const defaults = {
        origin: { y: 0.7 }
      };

      function fire(particleRatio, opts) {
        window.confetti({
          ...defaults,
          ...opts,
          particleCount: Math.floor(count * particleRatio),
          colors: ['#22c55e', '#10b981', '#059669']
        });
      }

      fire(0.25, {
        spread: 26,
        startVelocity: 55,
        origin: { x: 0.2, y: 0.7 }
      });

      fire(0.2, {
        spread: 60,
        origin: { x: 0.5, y: 0.7 }
      });

      fire(0.35, {
        spread: 100,
        decay: 0.91,
        scalar: 0.8,
        origin: { x: 0.8, y: 0.7 }
      });
    }
  }
  
  _renderUsers() {
    return this._taskConfig.users.map(user => html`
      <div class="user-section">
        <div class="user-header">
          <ha-icon 
            icon="${user.usericon || 'mdi:account'}" 
            class="user-icon"
          ></ha-icon>
          <div class="user-info">
            <div class="user-name">
              <span>${user.name}</span>
              ${this._renderRewards(user)}
            </div>
            <div class="user-role">${user.role}</div>
          </div>
        </div>
        <div class="tasks-grid">
          ${this._renderTasks(user)}
        </div>
      </div>
    `);
  }
  
  render() {
    if (!this._hass || !this._config || !this._taskConfig) {
      return html`
        <ha-card>
          <div class="container">
            <div class="loading">
              Lädt... Bitte warten.
              ${!this._hass ? html`<div>Warte auf Home Assistant</div>` : ''}
              ${!this._config ? html`<div>Warte auf Konfiguration</div>` : ''}
              ${!this._taskConfig ? html`<div>Lade Aufgaben</div>` : ''}
            </div>
          </div>
        </ha-card>
      `;
    }

    return html`
      <ha-card>
        <div class="container">
          <div class="header">
            <div class="title">${this._config.title || "Aufgaben-Planer"}</div>
            <div class="date">
              ${new Date().toLocaleDateString("de-DE", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          </div>
          ${this._renderDaySelector()}
          ${this._renderUsers()}
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      :host {
        --task-blue-bg: rgb(219, 234, 254);
        --task-blue-text: rgb(30, 58, 138);
        --task-emerald-bg: rgb(209, 250, 229);
        --task-emerald-text: rgb(6, 95, 70);
        --task-amber-bg: rgb(254, 243, 199);
        --task-amber-text: rgb(146, 64, 14);
        --task-red-bg: rgb(254, 226, 226);
        --task-red-text: rgb(153, 27, 27);
        --task-green-bg: rgb(220, 252, 231);
        --task-green-text: rgb(22, 101, 52);
      }

      ha-card {
        padding: 16px;
      }

      .container {
        padding: 16px;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }

      .title {
        font-size: 24px;
        font-weight: bold;
        color: var(--primary-text-color);
      }

      .day-selector {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        overflow-x: auto;
        padding: 4px;
      }

      .day-button {
        padding: 8px 16px;
        border: none;
        border-radius: 16px;
        cursor: pointer;
        background: var(--primary-color);
        color: var(--text-primary-color);
        opacity: 0.7;
        transition: all 0.3s ease;
        position: relative;
      }

      .day-button.selected {
        opacity: 1;
        transform: scale(1.05);
        font-weight: bold;
      }

      .today-marker {
        position: absolute;
        top: -8px;
        right: -8px;
        background: var(--accent-color);
        color: var(--text-primary-color);
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 10px;
      }

      .user-section {
        margin-bottom: 24px;
      }

      .user-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--card-background-color);
        border-radius: 8px;
        margin-bottom: 16px;
      }

      .user-info {
        flex-grow: 1;
      }

      .user-name {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: bold;
      }

      .user-role {
        font-size: 14px;
        color: var(--secondary-text-color);
      }

      .tasks-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
      }

      .task-card {
        padding: 16px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .task-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      }

      .task-card.disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .task-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: bold;
      }

      .task-description {
        margin-top: 8px;
        font-size: 14px;
      }

      .disabled-notice {
        margin-top: 8px;
        font-size: 12px;
        font-style: italic;
      }

      .rewards-container {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .reward-group {
        display: flex;
        align-items: center;
        gap: 4px;
        background: rgba(0,0,0,0.05);
        padding: 2px 6px;
        border-radius: 12px;
      }

      .reward-count {
        font-size: 12px;
      }

      .star { color: #FFD700; }
      .trophy { color: #FFD700; }
      .medal { color: #C9B037; }

      .no-tasks {
        text-align: center;
        color: var(--secondary-text-color);
        font-style: italic;
        padding: 32px;
      }

      .loading {
        text-align: center;
        padding: 32px;
        color: var(--secondary-text-color);
      }
    `;
  }
}

customElements.define("task-planner-card", TaskPlannerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "task-planner-card",
  name: "Task Planner Card",
  preview: true,
  description: "Eine Karte zur Anzeige und Verwaltung von Aufgaben"
});
