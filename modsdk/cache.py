import os
from tornado import ioloop
from modsdk.settings import UNITS_FILE
from modcommon import lv2

try:
    import pyinotify

    class WorkspaceCache(dict):
        """
        This dict is used to store the bundle data indexed by bundle name.
        It uses pyinotify to monitor workspace directory and remove bundle cache
        when any modification to that bundle is done in filesystem.
        """
        def __init__(self, basedir):
            self.basedir = os.path.realpath(basedir)
            self.monitoring = False
            self.cycle()

        def monitor(self):
            if not os.path.isdir(self.basedir) or self.monitoring:
                return

            self.monitoring = True

            self.wm = pyinotify.WatchManager()
            self.mask = pyinotify.IN_DELETE | pyinotify.IN_CREATE  | pyinotify.IN_CLOSE_WRITE

            self.notifier = pyinotify.Notifier(self.wm, EventHandler(self), timeout=1)

            self.register_dir(self.basedir)

            super(WorkspaceCache, self).__init__()

        def register_dir(self, path):
            self.wm.add_watch(path, self.mask, rec=True)
            try:
                for filename in os.listdir(path):
                    filename = os.path.join(path, filename)
                    self.notify(filename)
                    if os.path.isdir(filename):
                        self.register_dir(filename)
            except OSError:
                # Directory might have been removed
                pass

        def cycle(self):
            if self.monitoring:
                self.notifier.process_events()
                if self.notifier.check_events():
                    self.notifier.read_events()
            else:
                for key in self.keys():
                    self.pop(key)
                self.monitor()

            ioloop.IOLoop.instance().add_callback(self.cycle)

        def notify(self, path):
            path = path[len(self.basedir)+1:]
            bundle = path.split('/')[0]
            if self.get(bundle) is not None:
                print "%s modified, clearing %s cache" % (path, bundle)
                self.pop(bundle)

    class EventHandler(pyinotify.ProcessEvent):

        def __init__(self, monitor):
            super(EventHandler, self).__init__()
            self.monitor = monitor

        def process_IN_CREATE(self, event):
            self.monitor.notify(event.pathname)
            if os.path.isdir(event.pathname):
                self.monitor.register_dir(event.pathname)

        def process_IN_DELETE(self, event):
            self.monitor.notify(event.pathname)

        def process_IN_CLOSE_WRITE(self, event):
            self.monitor.notify(event.pathname)

except ImportError:

    class WorkspaceCache(dict):
        def __init__(self, basedir):
            super(WorkspaceCache, self).__init__()
            self.cycle()

        def cycle(self):
            for key in self.keys():
                self.pop(key)
            ioloop.IOLoop.instance().add_callback(self.cycle)

BUNDLE_CACHE = None

#singleton
def get_cache_instance(workspace):
    global BUNDLE_CACHE
    if BUNDLE_CACHE:
        return BUNDLE_CACHE
    BUNDLE_CACHE = WorkspaceCache(workspace)
    return BUNDLE_CACHE
    
def get_bundle_data(workspace, bundle):
    if BUNDLE_CACHE.get(bundle):
        return BUNDLE_CACHE[bundle]
    path = os.path.join(workspace, bundle)
    open(os.path.join(path, 'manifest.ttl'))
    package = lv2.Bundle(path, units_file=UNITS_FILE, allow_inconsistency=True)
    BUNDLE_CACHE[bundle] = package.data
    return BUNDLE_CACHE[bundle]


