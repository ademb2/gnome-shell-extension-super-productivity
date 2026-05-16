import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import Clutter from 'gi://Clutter';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

const API_URL = 'http://127.0.0.1:3876';
const POLL_INTERVAL_SECONDS = 3; // Updated to seconds for better battery efficiency

function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatTimeSpent(ms) {
    if (!ms || ms < 0) return '';
    
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

const SuperProductivityButton = GObject.registerClass(
    class SuperProductivityButton extends PanelMenu.Button {
        _init() {
            super._init(0.0, 'Super Productivity', false);

            this._container = new St.BoxLayout({
                style_class: 'spi-container'
            });

            this._taskLabel = new St.Label({
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'spi-task-label',
                text: ''
            });

            this._timeLabel = new St.Label({
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'spi-time-label',
                text: ''
            });

            this._container.add_child(this._taskLabel);
            this._container.add_child(this._timeLabel);
            this.add_child(this._container);
        }

        updateDisplay(taskText, timeText) {
            this._taskLabel.set_text(taskText);
            this._timeLabel.set_text(timeText);
        }

        clearDisplay() {
            this._taskLabel.set_text('');
            this._timeLabel.set_text('');
        }
    }
);

export default class SuperProductivityIndicator extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._pollTimeout = null;
        this._httpSession = null;
        
        // NEW: Track network requests and reuse the decoder
        this._cancellable = null; 
        this._decoder = new TextDecoder('utf-8'); 
    }

    enable() {
        this._httpSession = new Soup.Session();
        this._cancellable = new Gio.Cancellable(); // NEW: Initialize cancellable

        this._indicator = new SuperProductivityButton();
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._startPolling();
    }

    disable() {
        if (this._pollTimeout) {
            GLib.source_remove(this._pollTimeout);
            this._pollTimeout = null;
        }

        // NEW: Cancel any in-flight network requests gracefully
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }

        if (this._httpSession) {
            this._httpSession.abort();
            this._httpSession = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _startPolling() {
        this._pollStatus();
        
        // NEW: Use timeout_add_seconds to coalesce CPU wake-ups
        this._pollTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_INTERVAL_SECONDS, () => {
            this._pollStatus();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _pollStatus() {
        try {
            const message = Soup.Message.new('GET', API_URL + '/status');

            const bytes = await new Promise((resolve, reject) => {
                this._httpSession.send_and_read_async(
                    message,
                    GLib.PRIORITY_DEFAULT,
                    this._cancellable, // NEW: Pass the cancellable instead of null
                    (session, result) => {
                        try {
                            const responseBytes = session.send_and_read_finish(result);
                            resolve(responseBytes);
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });

            if (message.get_status() !== Soup.Status.OK) {
                this._hideIndicator();
                return;
            }

            // NEW: Use the reusable decoder instantiated in the constructor
            const responseText = this._decoder.decode(bytes.get_data());
            const data = JSON.parse(responseText);

            if (data.ok && data.data.currentTask) {
                const task = data.data.currentTask;
                const today = getTodayDateString();
                const todaySpent = task.timeSpentOnDay ? task.timeSpentOnDay[today] : 0;

                this._indicator.updateDisplay(task.title || '', formatTimeSpent(todaySpent));
                this._indicator.show();
            } else {
                this._hideIndicator();
            }
        } catch (e) {
            // NEW: Silently ignore cancellation errors if the extension was disabled mid-request
            if (e.matches && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                return;
            }
            
            this._hideIndicator();
        }
    }

    _hideIndicator() {
        if (this._indicator) {
            this._indicator.clearDisplay();
            this._indicator.hide();
        }
    }
}