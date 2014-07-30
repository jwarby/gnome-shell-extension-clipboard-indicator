const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const DND = imports.ui.dnd;
const St = imports.gi.St;

const Params = imports.misc.params;

const Clipboard = St.Clipboard.get_default();
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

const MAX_LENGTH = 50;

const ClipboardMenuItem = Lang.Class({
    Name: 'ClipboardMenuItem',
    Extends: PopupMenu.PopupMenuItem,

    _init: function(params) {
        // Parse params and set defaults
        params = Params.parse(params, {
            text: '',
            sticky: false,
            selected: false
        });

        // Truncate the text if it exceeds MAX_LENGTH
        let shortened = params.text.substr(0,MAX_LENGTH);
        shortened += (params.text.length > MAX_LENGTH) ? '...' : '';

        this.parent(shortened, {
            activate: false
        });

        // Make draggable
        this.dragActor = DND.makeDraggable(this.actor);

        // Set properties
        this.text = params.text;
        this.sticky = params.sticky;
        this.selected = params.selected;
    },

    destroy: function() {
        // Unbind all events
        this.dragActor.disconnectAll();
        // If selected, clear clipboard text
        if (this.selected) {
            Clipboard.set_text(CLIPBOARD_TYPE, '');
        }

        this.parent();
    },

    setSelected: function(selected, options) {
        options = options || {};
        this.selected = !!(selected);
        let copy = options.copy_to_clipboard != null ?
            options.copy_to_clipboard : true;

        if (this.selected) {
            this.setOrnament(PopupMenu.Ornament.DOT);

            if (copy) {
                Clipboard.set_text(CLIPBOARD_TYPE, this.text);
            }
        } else {
            this.setOrnament(PopupMenu.Ornament.NONE);
        }
    },

    setSticky: function(sticky) {
        this.sticky = !!(sticky);
    },

    isSticky: function() {
        return this.sticky;
    },

    getText: function() {
        return this.text;
    },

    toJSON: function() {
        return {
            text: this.getText(),
            sticky: this.isSticky()
        };
    }
});
