const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const Signals = imports.signals;
const St = imports.gi.St;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const ClipboardMenuItem = Me.imports.clipboardMenuItem.ClipboardMenuItem;

const ClipboardRemoveSection = Lang.Class({
    Name: 'ClipboardRemoveSection',
    Extends: PopupMenu.PopupMenuSection,

    _init: function() {
        this.parent();

        this.removeIcon = new St.Icon({
            icon_name: 'user-trash-symbolic',
            style_class: 'clipboard-indicator-remove-icon'
        });

        let removeMenuItem = new PopupMenu.PopupMenuItem('', {
            reactive: false,
            activate: false
        });
        removeMenuItem.actor.add_child(this.removeIcon);

        this.addMenuItem(removeMenuItem);
    },

    acceptDrop: function(source, actor, x, y) {
        let accepted;

        if (source instanceof ClipboardMenuItem) {
            source._getTopMenu()._clipboardInstance._destroyEntry(source);
            accepted = true;
        } else {
            accepted = false;
        }

        this._onHoverOff();
        this.emit('item-dropped', source);

        return accepted;
    },

    _onHoverOn: function() {
        this.removeIcon.add_style_pseudo_class('drag-hover');
    },

    _onHoverOff: function() {
        this.removeIcon.remove_style_pseudo_class('drag-hover');
    }
});
