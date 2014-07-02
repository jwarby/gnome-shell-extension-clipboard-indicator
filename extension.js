const Lang = imports.lang;
const Mainloop = imports.mainloop;
const St = imports.gi.St;

const BoxPointer = imports.ui.boxpointer;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const DND = imports.ui.dnd;

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
const ZEBRA_STRIPE_OPACITY = 180;

const ClipboardStickySection = Me.imports.models.clipboardStickySection.ClipboardStickySection;
const ClipboardRemoveSection = Me.imports.models.clipboardRemoveSection.ClipboardRemoveSection;
const ClipboardMenuItem = Me.imports.models.clipboardMenuItem.ClipboardMenuItem;

const STATES = {
    'normal': {
        events: {
            'list_emptied': 'empty',
            'item_drag_start': 'dragging'
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
                consumeEvent('list_emptied');
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
        exit: function() { }
    },
    'empty': {
        events: {
            'item_added': 'normal'
        },
        /* On entering the empty state, clear the clipboard text and disable
         * the clear mode toggle.
         */
        enter: function () {
            this.actor.hide();
        },
        /* On exit, re-enable the clear mode toggle
         */
        exit: function () {
            this.actor.show();
        }
    },
    'dragging': {
        events: {
            'item_drag_end': 'normal'
        },
        enter: function () {
            this._dragMonitor = {
                dragMotion: Lang.bind(this, this._onDragMotion)
            };
            DND.addDragMonitor(this._dragMonitor);
        },
        exit: function () {
            this._updateZebraStriping();
            this._updateCache();
            this.removeSection._onHoverOff();

            DND.removeDragMonitor(this._dragMonitor);
        }
    }
};

let _clipboardTimeoutId = null;
let clipboardHistory = [];


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
        this.menu.actor.add_style_class_name('clipboard-indicator-menu');

        this.menu._clipboardInstance = this;

        this._buildMenu();
        this._setupTimeout();
    },

    _onDragStart: function () {
        consumeEvent('item_drag_start');
    },

    _onDragMotion: function (dragEvent) {
        if (this.removeSection.box.contains(dragEvent.targetActor)) {
            this.removeSection._onHoverOn();
        } else {
            this.removeSection._onHoverOff();
        }

        return DND.DragMotionResult.CONTINUE;
    },

    _onDragEnd: function () {
        consumeEvent('item_drag_end');
    },

    _buildMenu: function () {
        let that = this;

        this.removeSection = new ClipboardRemoveSection();
        this.stickySection = new ClipboardStickySection();

        this.removeSection.connect(
            'item-dropped', Lang.bind(this, this._onDragEnd)
        );
        // Add the clear mode toggle, sticky area placeholder and separator
        for (let menu of [this.removeSection, this.stickySection]) {
            this.menu.addMenuItem(menu);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        this._getCache().forEach(function (clipItem) {
            that._addEntry(clipItem);
        });

        if (this._getLastItem()) {
            this._selectMenuItem(this._getLastItem());
        } else {
            consumeEvent('list_emptied');
        }
    },

    _addEntry: function (clipItem, autoSelect) {
        // Create the new entry
        let menuItem = new ClipboardMenuItem({
            text: clipItem.text,
            sticky: clipItem.sticky,
            selected: autoSelect
        });

        // Push to list of items and consume item added event
        this.clipItemsRadioGroup.push(menuItem);
        consumeEvent('item_added');

        // Draggable behaviour
        menuItem.dragActor.connect(
            'drag-begin', Lang.bind(this, this._onDragStart)
        );
        menuItem.dragActor.connect(
            'drag-end', Lang.bind(this, this._onDragEnd)
        );

        menuItem.radioGroup = this.clipItemsRadioGroup;
        menuItem.buttonReleaseId = menuItem.actor.connect(
            'button-release-event',
            Lang.bind(this, this._onButtonReleased)
        );

        if (menuItem.isSticky()) {
            this.stickySection.addMenuItem(menuItem);
        } else {
            this.menu.addMenuItem(menuItem);
        }

        if (autoSelect === true) this._selectMenuItem(menuItem);
        this._updateCache();
        this._updateZebraStriping();
        this._removeOldestEntries();
    },

    _updateZebraStriping: function () {
        for (let menu of [this.menu, this.stickySection]) {
            menu._getMenuItems().forEach(function (menuItem, index) {
                if (menuItem instanceof PopupMenu.PopupMenuSection) {
                    return;
                }
                // Fade even-indexed items for a zebra stripe effect
                if (index % 2 === 0) {
                    menuItem.actor.opacity = ZEBRA_STRIPE_OPACITY;
                } else {
                    menuItem.actor.opacity = 255;
                }
            });
        }
    },

    _removeOldestEntries: function () {
        let filtered = this.clipItemsRadioGroup.filter(function(item, index) {
            return !item.isSticky();
        });

        while (filtered.length > MAX_REGISTRY_LENGTH) {
            this._destroyEntry(filtered.shift());
        }
    },

    _destroyEntry: function (entry) {
        if (entry === this.selectedItem) {
            this.selectedItem = null;
        }

        entry.actor.disconnect(entry.buttonReleaseId);
        entry.destroy();

        // Remove from list
        this.clipItemsRadioGroup = this.clipItemsRadioGroup
            .filter(function (item) {
                return item !== entry;
            });

        this._updateCache();
        this._updateZebraStriping();

        if (this.stickySection.isEmpty()) {
            this.stickySection._addPlaceholder();
        }
    },

    _onButtonReleased: function (actor, event) {
        let that = this;
        this._onMenuItemSelected(actor, event);

        Mainloop.timeout_add(100, function() {
            that.menu.close(BoxPointer.PopupAnimation.FULL);
        });
    },

    _onMenuItemSelected: function (actor, event) {
        let that = this;

        this.clipItemsRadioGroup.forEach(function (menuItem) {
            let clipContents = menuItem.getText();

            if (menuItem.actor === actor && clipContents) {
                that.selectedItem = menuItem;
                menuItem.setSelected(true);
            } else {
                menuItem.setSelected(false);
            }
        });
    },

    _selectMenuItem: function (menuItem) {
        Lang.bind(this, this._onMenuItemSelected).call(this, menuItem.actor);
    },

    _getCache: function () {
        return readRegistry();
    },

    _updateCache: function () {
        writeRegistry(this.clipItemsRadioGroup.map(function (menuItem) {
            return menuItem.toJSON();
        }));
    },

    _refreshIndicator: function () {
        let that = this;
        Clipboard.get_text(CLIPBOARD_TYPE, function (clipBoard, text) {
            let registry = that.clipItemsRadioGroup.map(function (menuItem) {
                return menuItem.getText();
            });
            if (text) {
                let index = registry.indexOf(text);
                if (index === -1) {
                    that._addEntry({
                        text: text,
                        sticky: false
                    }, true);
                } else if (that.state === 'normal') {
                    that._selectMenuItem(that.clipItemsRadioGroup[index]);
                }
            }
        });
    },

    _setupTimeout: function (recurse) {
        let that = this;
        recurse = typeof recurse === 'boolean' ? recurse : true;

        _clipboardTimeoutId = Mainloop.timeout_add(TIMEOUT_MS, function () {
            that._refreshIndicator();
            recurse && that._setupTimeout();
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

function consumeEvent (event) {
    if (!clipboardIndicator) { return; }

    let state = STATES[clipboardIndicator.state];
    // Test if clipboardIndicator state responds to the event
    if (state.events[event]) {
        // Run exit function for current state
        state.exit.call(clipboardIndicator);
        // Set new state
        clipboardIndicator.state = state.events[event];
        clipboardIndicator.menu.state = clipboardIndicator.state;
        // Run enter function for new state
        STATES[clipboardIndicator.state].enter.call(clipboardIndicator);
    }
}
