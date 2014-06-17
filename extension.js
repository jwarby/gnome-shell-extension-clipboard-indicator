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

const MODE_NORMAL = 0;
const MODE_CLEAR = 1;

let _clipboardTimeoutId = null;
let clipboardHistory = [];
let currentMode = MODE_NORMAL;
let selectedItem = null;

const PopupSwitchMenuItemNoAutoClose = Lang.Class({
    Name: 'PopupSwitchMenuItemNoAutoClose',
    Extends: PopupMenu.PopupSwitchMenuItem,

    activate: function(event) {
        if (this._switch.actor.mapped) {
            this.toggle();
        }
    }
});

const PopupClipboardMenuItem = Lang.Class({
    Name: 'PopupClipboardMenuItem',
    Extends: PopupMenu.PopupMenuItem,

    activate: function(event) {
        if (currentMode === MODE_NORMAL) {
            this.parent(event);
        }
    }
});

const ClipboardIndicator = Lang.Class({
        Name: 'ClipboardIndicator',
        Extends: PanelMenu.Button,

        clipItemsRadioGroup: [],

        _init: function() {
            this.parent(0.0, 'ClipboardIndicator');
            let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box clipboard-indicator-hbox' });
            let icon = new St.Icon({ icon_name: 'edit-cut-symbolic', //'mail-attachment-symbolic',
                                     style_class: 'system-status-icon clipboard-indicator-icon' });

            hbox.add_child(icon);
            this.actor.add_child(hbox);

            this._buildMenu();
            this._setupTimeout();
        },

        _buildMenu: function () {
            let that = this;
            let clipHistory = this._getCache();
            let lastIdx = clipHistory.length - 1;
            let clipItemsArr = this.clipItemsRadioGroup;
            // Clear mode toggle and separator
            let clearModeToggle = new PopupSwitchMenuItemNoAutoClose(
                _('Clear Items'),
                currentMode === MODE_CLEAR
            );
            let separator = new PopupMenu.PopupSeparatorMenuItem();

            // Add event listener
            clearModeToggle.connect(
                'toggled', Lang.bind(this, this._onClearToggled)
            );

            clearModeToggle.connect('activate', Lang.bind(this, function() {
                return;
            }));

            // Add the clear mode toggle and separator
            this.menu.addMenuItem(clearModeToggle);
            this.menu.addMenuItem(separator);

            clipHistory.forEach(function (clipItem) {
                that._addEntry(clipItem);
            });

            if (lastIdx >= 0) {
                this._selectMenuItem(clipItemsArr[lastIdx]);
            }
        },

        _addEntry: function (clipItem, autoSelect) {
            let shortened = clipItem.substr(0,MAX_ENTRY_LENGTH);
            if (clipItem.length > MAX_ENTRY_LENGTH) shortened += '...';

            let menuItem = new PopupClipboardMenuItem(shortened);
            this.clipItemsRadioGroup.push(menuItem);

            menuItem.clipContents = clipItem;
            menuItem.radioGroup = this.clipItemsRadioGroup;
            menuItem.buttonPressId = menuItem.actor.connect(
                'button-press-event',
                Lang.bind(menuItem, this._onMenuItemSelected)
            );

            this.menu.addMenuItem(menuItem);
            if (autoSelect === true) this._selectMenuItem(menuItem);
            this._updateCache();
        },

        _removeOldestEntries: function () {
            let that = this;
            while (that.clipItemsRadioGroup.length > MAX_REGISTRY_LENGTH) {
                let oldest = that.clipItemsRadioGroup.shift();
                oldest.actor.disconnect(oldest.buttonPressId);
                oldest.destroy();
            }

            that._updateCache();
        },

        _removeCheckedEntries: function() {
            this.clipItemsRadioGroup = this.clipItemsRadioGroup.filter(
                function(item) {
                    if (item._ornament === PopupMenu.Ornament.CHECK) {
                        item.actor.disconnect(item.buttonPressId);
                        item.destroy();

                        return false;
                    }

                    if (item === selectedItem ){
                        item.setOrnament(PopupMenu.Ornament.DOT);
                    } else {
                        item.setOrnament(PopupMenu.Ornament.NONE);
                    }

                    return true;
                }
            );

            this._updateCache();
        },

        _onMenuItemSelected: function (actor, event) {
            let that = this;

            that.radioGroup.forEach(function (menuItem) {
                let clipContents = that.clipContents;

                if (currentMode === MODE_NORMAL) {
                    if (menuItem === that && clipContents) {
                        menuItem.setOrnament(PopupMenu.Ornament.DOT);
                        Clipboard.set_text(CLIPBOARD_TYPE, clipContents);
                    }
                    else {
                        menuItem.setOrnament(PopupMenu.Ornament.NONE);
                    }
                } else if (currentMode === MODE_CLEAR) {
                    if (menuItem === that && clipContents) {
                        menuItem.setOrnament(PopupMenu.Ornament.CHECK);
                    } else if (menuItem._ornament !== PopupMenu.Ornament.CHECK) {
                        menuItem.setOrnament(PopupMenu.Ornament.NONE);
                    }
                }
            });

            return currentMode === MODE_NORMAL;
        },

        _clearItemOrnaments: function() {
            let that = this;

            this.clipItemsRadioGroup.forEach(function(menuItem) {
                if (menuItem._ornament === PopupMenu.Ornament.DOT) {
                    selectedItem = menuItem;
                }
                menuItem.setOrnament(PopupMenu.Ornament.NONE);
            });
        },

        _onClearToggled: function(actor, event) {
            currentMode = (event === true) ? MODE_CLEAR : MODE_NORMAL;

            if (currentMode === MODE_NORMAL) {
               this. _removeCheckedEntries();
            } else {
                this._clearItemOrnaments();
            }
        },

        _selectMenuItem: function (menuItem) {
            Lang.bind(menuItem, this._onMenuItemSelected).call();
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
