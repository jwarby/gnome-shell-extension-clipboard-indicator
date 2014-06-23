const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Gtk = imports.gi.Gtk;

const BoxPointer = imports.ui.boxpointer;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const CheckBox = imports.ui.checkBox.CheckBox;

const Clipboard = St.Clipboard.get_default();
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const prettyPrint = Convenience.dbPrintObj;
const writeRegistry = Convenience.writeRegistry;
const readRegistry = Convenience.readRegistry;

const TIMEOUT_MS = 1000;
const MAX_REGISTRY_LENGTH = 15;
const MAX_ENTRY_LENGTH = 50;
const ZEBRA_STRIPE_OPACITY = 180;

const STATES = {
    'normal': {
        events: {
            'enter_clear_mode': 'clear_mode',
            'list_emptied': 'empty'
        },
        /* On enter, loop through the items and set the correct ornaments -
         * 'dot' ornament if the item is the currently selected item; 'none'
         * if not currently selected
         */
        enter: function() {
            let that = this;

            // If no selected item, choose the last one
            this.selectedItem = this.selectedItem || this._getLastItem();

            if (!this.selectedItem) {
                this._consumeEvent('list_emptied');
                return;
            }

            this._selectMenuItem(this.selectedItem, true);

            this.clipItemsRadioGroup.forEach(function(item, index) {
                if (that.selectedItem === item) {
                    item.setOrnament(PopupMenu.Ornament.DOT);
                } else {
                    item.setOrnament(PopupMenu.Ornament.NONE);
                }
            });
        },
        /* On exit, loop through the items and remove their ornamentation.
         * When an item with a 'dot' ornament is encountered, store the item
         * as the currently selected item
         */
        exit: function() {
            let that = this;

            this.clipItemsRadioGroup.forEach(function(item, index) {
                item.setOrnament(PopupMenu.Ornament.NONE);
            });
        },
        data: {
            ornament: PopupMenu.Ornament.DOT
        }
    },
    'clear_mode': {
        events: {
            'exit_clear_mode': 'normal'
        },
        enter: function() { },
        /* On exit, filter the list of items by removing those which have
         * the 'check' ornament; also remove the rendered item and destroy
         * the event listeners attached to it.
         */
        exit: function() {
            let that = this;

            this.clipItemsRadioGroup.forEach(function(item, index) {
                if (item._ornament === PopupMenu.Ornament.CHECK) {
                    that._destroyEntry(item);
                }
            });
        },
        data: {
            ornament: PopupMenu.Ornament.CHECK
        }
    },
    'empty': {
        events: {
            'item_added': 'normal'
        },
        /* On entering the empty state, clear the clipboard text and disable
         * the clear mode toggle.
         */
        enter: function () {
            Clipboard.set_text(CLIPBOARD_TYPE, '');
            this.actor.hide();
        },
        /* On exit, re-enable the clear mode toggle
         */
        exit: function () {
            this.actor.show();
        }
    }
};

let _clipboardTimeoutId = null;
let clipboardHistory = [];

/* Extend the default PopupSwitchMenuItem class so that we can override the
 * default behaviour of closing the menu on click.
 */
const PopupClipboardSwitchMenuItem = Lang.Class({
    Name: 'PopupClipboardSwitchMenuItem',
    Extends: PopupMenu.PopupSwitchMenuItem,

    activate: function(event) {
        // If toggle is currently on, let the parent event handle it so that
        // menu gets closed after toggling
        if (this.state) {
            this.parent(event);
        // Otherwise, just do the toggle to the 'on' state, without hiding the
        // menu afterwards
        } else if (this._switch.actor.mapped) {
            this.toggle();
        }
    }
});

/* Extend the default PopupMenuItem class so that we can override the
 * default behaviour of closing the menu on click.
 */
const PopupClipboardMenuItem = Lang.Class({
    Name: 'PopupClipboardMenuItem',
    Extends: PopupMenu.PopupMenuItem,

    activate: function(event) {
        // If in normal mode, allow the event to go through the parent and thus
        // automatically close the menu
        if (this._getTopMenu().state === 'normal') {
            this.parent(event);
        }
    }
});

const ClipboardIndicator = Lang.Class({
    Name: 'ClipboardIndicator',
    Extends: PanelMenu.Button,

    clipItemsRadioGroup: [],
    state: 'normal',

    _init: function() {
        this.parent(0.0, 'ClipboardIndicator');

        let hbox = new St.BoxLayout({
            style_class: 'panel-status-menu-box clipboard-indicator-hbox'
        });
        let icon = new St.Icon({
            icon_name: 'edit-cut-symbolic',
            style_class: 'system-status-icon clipboard-indicator-icon'
        });

        hbox.add_child(icon);
        this.actor.add_child(hbox);

        this.menu.state = this.state;

        this._buildMenu();
        this._setupTimeout();
    },

    _buildMenu: function () {
        let that = this;
        let clipHistory = this._getCache();
        let clipItemsArr = this.clipItemsRadioGroup;
        // Clear mode toggle and separator
        this.clearModeToggle = new PopupClipboardSwitchMenuItem(
            _('Clear Items'),
            that.state === 'clear_mode'
        );
        let separator = new PopupMenu.PopupSeparatorMenuItem();

        // Add event listener
        this.clearModeToggle.connect(
            'toggled', Lang.bind(this, this._onClearToggled)
        );

        // Add the clear mode toggle and separator
        this.menu.addMenuItem(this.clearModeToggle);
        this.menu.addMenuItem(separator);

        clipHistory.forEach(function (clipItem) {
            that._addEntry(clipItem);
        });

        if (this._getLastItem()) {
            this._selectMenuItem(this._getLastItem());
        } else {
            this._consumeEvent('list_emptied');
        }
    },

    _addEntry: function (clipItem, autoSelect) {
        let shortened = clipItem.substr(0,MAX_ENTRY_LENGTH);
        if (clipItem.length > MAX_ENTRY_LENGTH) shortened += '...';

        let menuItem = new PopupClipboardMenuItem(shortened);
        this.clipItemsRadioGroup.push(menuItem);
        this._consumeEvent('item_added');

        menuItem.clipContents = clipItem;
        menuItem.radioGroup = this.clipItemsRadioGroup;
        menuItem.buttonPressId = menuItem.actor.connect(
            'button-press-event',
            Lang.bind(this, this._onMenuItemSelected)
        );

        this.menu.addMenuItem(menuItem);
        if (autoSelect === true) this._selectMenuItem(menuItem);
        this._updateCache();
        this._updateZebraStriping();
    },

    _updateZebraStriping: function () {
        this.clipItemsRadioGroup.forEach(function (menuItem, index) {
            // Fade even-indexed items for a zebra stripe effect
            if (index % 2 === 0) {
                menuItem.actor.opacity = ZEBRA_STRIPE_OPACITY;
            } else {
                menuItem.actor.opacity = 255;
            }
        });
    },

    _removeOldestEntries: function () {
        while (this.clipItemsRadioGroup.length > MAX_REGISTRY_LENGTH) {
            this._destroyEntry(this.clipItemsRadioGroup.shift());
        }
    },

    _destroyEntry: function (entry) {
        if (entry === this.selectedItem) {
            this.selectedItem = null;
        }

        entry.actor.disconnect(entry.buttonPressId);
        entry.destroy();

        // Remove from list
        this.clipItemsRadioGroup = this.clipItemsRadioGroup
            .filter(function (item) {
                return item !== entry;
            });

        this._updateCache();
        this._updateZebraStriping();
    },

    _onMenuItemSelected: function (actor, event) {
        let that = this;
        let ornament = STATES[this.state].data.ornament;

        this.clipItemsRadioGroup.forEach(function (menuItem) {
            let clipContents = menuItem.clipContents;

            if (menuItem.actor === actor && clipContents) {
                switch (that.state) {
                    case 'normal':
                        that.selectedItem = menuItem;
                        Clipboard.set_text(CLIPBOARD_TYPE, clipContents);
                        break;
                    case 'clear_mode':
                        // Allow checked items to be toggled on/off
                        if (menuItem._ornament === ornament) {
                            ornament = PopupMenu.Ornament.NONE;
                        }
                        break;
                }

                menuItem.setOrnament(ornament);
            } else if (that.state !== 'clear_mode') {
                menuItem.setOrnament(PopupMenu.Ornament.NONE);
            }
        });
    },

    _onClearToggled: function(actor, event) {
        this._consumeEvent(event ? 'enter_clear_mode' : 'exit_clear_mode');
    },

    _consumeEvent: function(event) {
        let state = STATES[this.state];
        // Test if this state responds to the event
        if (state.events[event]) {
            // Run exit function for current state
            state.exit.call(this);
            // Set new state
            this.state = state.events[event];
            this.menu.state = this.state;
            // Run enter function for new state
            STATES[this.state].enter.call(this);
        }
    },

    _selectMenuItem: function (menuItem) {
        Lang.bind(this, this._onMenuItemSelected).call(this, menuItem.actor);
    },

    _getCache: function () {
        return readRegistry();
    },

    _updateCache: function () {
        writeRegistry(this.clipItemsRadioGroup.map(function (menuItem) {
            return menuItem.clipContents;
        }));
    },

    _refreshIndicator: function () {
        let that = this;
        Clipboard.get_text(CLIPBOARD_TYPE, function (clipBoard, text) {
            let registry = that.clipItemsRadioGroup.map(function (menuItem) {
                return menuItem.clipContents;
            });
            if (text && registry.indexOf(text) < 0) {
                that._addEntry(text, true);
                that._removeOldestEntries();
            }
        });
    },

    _setupTimeout: function (recurse) {
        let that = this;
        recurse = typeof recurse === 'boolean' ? recurse : true;

        _clipboardTimeoutId = Mainloop.timeout_add(TIMEOUT_MS, function () {
            that._refreshIndicator();
            if (recurse) that._setupTimeout();
        });
    },

    _getLastItem: function() {
        return this.clipItemsRadioGroup[this.clipItemsRadioGroup.length - 1];
    }
});


function init () {

}

let clipboardIndicator;
function enable () {
    clipboardIndicator = new ClipboardIndicator();
    Main.panel.addToStatusArea('clipboardIndicator', clipboardIndicator, 1);
}

function disable () {
    clipboardIndicator.destroy();
    if (_clipboardTimeoutId) Mainloop.source_remove(_clipboardTimeoutId);
}
