const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const Signals = imports.signals;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const ClipboardMenuItem = Me.imports.clipboardMenuItem.ClipboardMenuItem;

const ClipboardStickySection = Lang.Class({
    Name: 'ClipboardStickySection',
    Extends: PopupMenu.PopupMenuSection,

    _init: function(clipboardIndicatorInstance) {
        this.parent();

        this._clipboardIndicatorInstance = clipboardIndicatorInstance;

        this.titleMenuItem = new PopupMenu.PopupMenuItem(
            _('Sticky Items'),
            {
                activate: false,
                reactive: false
            }
        );

        let pinIcon = Convenience.getIconImage('/assets/push-pin.png');
        this.titleMenuItem.actor.add_child(pinIcon);

        this.addMenuItem(this.titleMenuItem);

        this._addPlaceholder();

        // Set sticky placeholder properties
        this.titleMenuItem.actor.add_style_class_name(
            'clipboard-indicator-section-title'
        );
    },

    acceptDrop: function(source, actor, x, y) {
        let accepted;
        if (source instanceof ClipboardMenuItem) {
            source.actor.reparent(this.actor);
            source.setSticky(true);
            this._removePlaceholder();
            accepted = true;
        } else {
            accepted = false;
        }

        return accepted;
    },

    /**
     * @override
     */
    _getMenuItems: function() {
        let that = this;

        return this.parent().filter(function(item, index) {
            return item !== that.titleMenuItem && item !== that.placeholder;
        });
    },

    _removePlaceholder: function() {
        if (this.placeholder) {
            this.placeholder.destroy();
            this.placeholder = null;
        }
    },

    _addPlaceholder: function() {
        if (this.placeholder) {
            return;
        }
        this.placeholder = new PopupMenu.PopupMenuItem(
            'Drag items here to sticky them',
            {
                reactive: false,
                activate: false
            }
        );
        this.placeholder.actor.add_style_class_name(
            'clipboard-indicator-placeholder');

        this.addMenuItem(this.placeholder);
    },

    isEmpty: function() {
        return this._getMenuItems().length === 0;
    },

    /**
     * @override
     */
    addMenuItem: function(item) {
        this.parent(item);

        if (item instanceof ClipboardMenuItem) {
            this._removePlaceholder();
        }
    }
});
