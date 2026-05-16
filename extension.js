import GObject from 'gi://GObject'; // NEW: Required for subclassing UI elements
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import Clutter from 'gi://Clutter';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

const API_URL = 'http://127.0.0.1:3876';
const POLL_INTERVAL = 3000;

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

// 1. Create a properly registered GObject class for the Button
const SuperProductivityButton = GObject.registerClass(
    class SuperProductivityButton extends PanelMenu.Button {
        _init() {
            // Call the parent constructor: menu alignment, name, don't create menu
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

        // Helper method to keep your extension code clean
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
    }

    enable() {
        this._httpSession = new Soup.Session();

        // 2. Instantiate your newly registered class
        this._indicator = new SuperProductivityButton();

        // This will now pass the instanceof check seamlessly
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._startPolling();
    }

    disable() {
        if (this._pollTimeout) {
            GLib.source_remove(this._pollTimeout);
            this._pollTimeout = null;
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
        this._pollTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_INTERVAL, () => {
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
                    null,
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

            const decoder = new TextDecoder('utf-8');
            const responseText = decoder.decode(bytes.get_data());
            const data = JSON.parse(responseText);

            if (data.ok && data.data.currentTask) {
                const task = data.data.currentTask;
                const today = getTodayDateString();
                const todaySpent = task.timeSpentOnDay ? task.timeSpentOnDay[today] : 0;

                // 3. Update using the helper method on the button class
                this._indicator.updateDisplay(task.title || '', formatTimeSpent(todaySpent));
                this._indicator.show();
            } else {
                this._hideIndicator();
            }
        } catch (e) {
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
