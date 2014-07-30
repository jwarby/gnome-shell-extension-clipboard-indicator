# Clipboard Indicator

Clipboard Manager extension for Gnome-Shell - Adds a clipboard indicator to the top panel, and caches clipboard history.

Extension page on e.g.o:
[https://extensions.gnome.org/extension/779/clipboard-indicator/](https://extensions.gnome.org/extension/779/clipboard-indicator/)

## Features

### Clipboard history

Stores the most recent clipboard items.

![Clipboard History](images/basic.gif?raw=true)

### Sticky items

Drag items to the sticky menu.  Stickied items won't get replaced by more recent clips, ever.

![Sticky Items](images/sticky.gif?raw=true)

### Delete items

Items can be deleted by dragging them to the trash icon at the top of the menu.

![Delete Items](images/delete.gif?raw=true)


## Installation


Installation via git is performed by cloning the repo into your local gnome-shell extensions directory (usually ~/.local/share/gnome-shell/extensions/):

```shell
$ git clone https://github.com/Tudmotu/gnome-shell-extension-clipboard-indicator.git <extensions-dir>/clipboard-indicator@tudmotu.com
```

After cloning the repo, the extension is practically installed yet disabled. In
order to enable it, you need to use `gnome-tweak-tools` - find the extension,
titled 'Clipboard Indicator', in the 'Extensions' screen and turn it 'On'.
You may need to restart the shell (Alt+F2 and insert 'r' in the prompt) for the
extension to be listed there.

