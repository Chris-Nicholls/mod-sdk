#!/usr/bin/env python

import os, json, random, subprocess, re, base64, shutil
import Image

from tornado import web, options, ioloop, template, httpclient, escape
from modcommon import lv2

PORT = 9000
ROOT = os.path.dirname(os.path.realpath(__file__))
HTML_DIR = os.path.join(ROOT, 'html')
WORKSPACE = os.path.join(ROOT, 'workspace')
WIZARD_DB = os.path.join(HTML_DIR, 'resources/wizard.json')
UNITS_FILE = os.path.join(ROOT, 'units.ttl')
CONFIG_FILE = os.path.join(ROOT, 'config.json')
TEMPLATE_DIR = os.path.join(HTML_DIR, 'resources/templates')
DEFAULT_TEMPLATE = os.path.join(ROOT, 'html/resources/templates/default.html')
SCREENSHOT_SCRIPT = os.path.join(ROOT, 'screenshot.js')
MAX_THUMB_WIDTH = 64
MAX_THUMB_HEIGHT = 64
PHANTOM_BINARY = os.path.join(ROOT, 'phantomjs-1.9.0-macosx/bin/phantomjs')
if not os.path.exists(PHANTOM_BINARY):
    PHANTOM_BINARY = os.path.join(ROOT, 'phantomjs-1.9.0-linux-x86_64/bin/phantomjs')

def get_config(key, default=None):
    try:
        config = json.loads(open(CONFIG_FILE).read())
        return config[key]
    except:
        return default

def slugify(name):
    slug = name.lower()
    slug = re.sub('\s+', '-', slug)
    slug = re.sub('[^a-z0-9-]', '', slug)
    return slug

class BundleList(web.RequestHandler):
    def get(self):
        self.set_header('Content-type', 'application/json')
        bundles = []
        if not os.path.isdir(WORKSPACE):
            self.write(json.dumps(bundles))
            return
        for bundle in os.listdir(WORKSPACE):
            if os.path.exists(os.path.join(WORKSPACE, bundle, 'manifest.ttl')):
                bundles.append(bundle)
        self.write(json.dumps(bundles))

class EffectList(web.RequestHandler):
    def get(self, bundle):
        path = os.path.join(WORKSPACE, bundle)
        if not os.path.exists(os.path.join(path, 'manifest.ttl')):
            raise web.HTTPError(404)
        package = lv2.Bundle(path, units_file=UNITS_FILE)
        self.set_header('Content-type', 'application/json')
        self.write(package.data)

class EffectSave(web.RequestHandler):
    def post(self):
        param = json.loads(self.request.body)
        bundle = param['effect']['package']
        path = os.path.join(WORKSPACE, bundle)
        if not os.path.exists(os.path.join(path, 'manifest.ttl')):
            raise web.HTTPError(404)
        basedir = os.path.join(path, 'modgui')
        if not os.path.exists(basedir):
            os.mkdir(basedir)

        template_name = 'pedal-%s-%s.html' % (param['model'], param['panel'])
        source = os.path.join(TEMPLATE_DIR, template_name)
        dest = os.path.join(basedir, template_name)
        shutil.copy(source, dest)

        data = {
            'color': param['color'],
            'label': param['label'],
            'author': param['author'],
            'controls': [ c['symbol'] for c in param['controls'] ],
            }
        datafile = os.path.join(basedir, 'data-%s.json' % slugify(param['effect']['name']))
        open(datafile, 'w').write(json.dumps(data, sort_keys=True, indent=4))

        self.set_header('Content-type', 'application/json')
        self.write(json.dumps(True))

class Index(web.RequestHandler):
    def get(self, path):
        if not path:
            path = 'index.html'
        loader = template.Loader(HTML_DIR)
        default_template = open(DEFAULT_TEMPLATE).read()
        context = {
            'default_template': escape.squeeze(default_template.replace("'", "\\'")),
            'wizard_db': json.dumps(json.loads(open(WIZARD_DB).read())),
            }
        self.write(loader.load(path).generate(**context))

class Screenshot(web.RequestHandler):
    @web.asynchronous
    def get(self):
        self.bundle = self.get_argument('bundle')
        self.effect = self.get_argument('effect')
        self.width = self.get_argument('width')
        self.height = self.get_argument('height')

        self.make_screenshot()

    def tmp_filename(self):
        tmp_filename = ''.join([ random.choice('0123456789abcdef') for i in range(6) ])
        return '/tmp/%s.png' % tmp_filename

    def make_screenshot(self):
        fname = self.tmp_filename()
        proc = subprocess.Popen([ PHANTOM_BINARY, 
                                  SCREENSHOT_SCRIPT,
                                  'http://localhost:%d/icon.html#%s,%s' % (PORT, self.bundle, self.effect),
                                  fname,
                                  self.width,
                                  self.height,
                                  ],
                                stdout=subprocess.PIPE)

        def proc_callback(fileno, event):
            if proc.poll() is None:
                return
            loop.remove_handler(fileno)
            fh = open(fname)
            os.remove(fname)
            self.handle_image(fh)

        loop = ioloop.IOLoop.instance()
        loop.add_handler(proc.stdout.fileno(), proc_callback, 16)

    def handle_image(self, fh):
        screenshot_data = fh.read()
        fh.seek(0)
        thumb_data = self.thumbnail(fh).read()

        self.save_icon(screenshot_data, thumb_data)

        result = {
            'ok': True,
            'screenshot': base64.b64encode(screenshot_data),
            'thumbnail': base64.b64encode(thumb_data),
            }

        self.set_header('Content-type', 'application/json')
        self.write(json.dumps(result))
        self.finish()

    def thumbnail(self, fh):
        img = Image.open(fh)
        width, height = img.size
        if width > MAX_THUMB_WIDTH:
            width = MAX_THUMB_WIDTH
            height = height * MAX_THUMB_WIDTH / width
        if height > MAX_THUMB_HEIGHT:
            height = MAX_THUMB_HEIGHT
            width = width * MAX_THUMB_HEIGHT / height
        img.thumbnail((width, height))
        fname = self.tmp_filename()
        img.save(fname)
        fh = open(fname)
        os.remove(fname)
        return fh

    def save_icon(self, screenshot_data, thumb_data):
        path = os.path.join(WORKSPACE, self.bundle)
        package = lv2.Bundle(path, units_file=UNITS_FILE)
        effect = package.data['plugins'][self.effect]
        slug = slugify(effect['name'])

        try:
            basedir = effect['icon']['basedir']
        except:
            basedir = os.path.join(path, 'modgui')
        if not os.path.exists(basedir):
            os.mkdir(basedir)

        screenshot_path = os.path.join(basedir, '%s-%s.png' % ('screenshot', slug))
        thumb_path = os.path.join(basedir, '%s-%s.png' % ('thumb', slug))

        open(screenshot_path, 'w').write(screenshot_data)
        open(thumb_path, 'w').write(thumb_data)

class BundleInstall(web.RequestHandler):
    @web.asynchronous
    def get(self, bundle):
        path = os.path.join(WORKSPACE, bundle)
        package = lv2.BundlePackage(path, units_file=UNITS_FILE)
        content_type, body = self.encode_multipart_formdata(package)

        headers = {
            'Content-Type': content_type,
            'Content-Length': str(len(body)),
            }

        client = httpclient.AsyncHTTPClient()
        addr = get_config('device', 'http://localhost:8888')
        if not addr.startswith('http://') and not addr.startswith('https://'):
            addr = 'http://%s' % addr
        if addr.endswith('/'):
            addr = addr[:-1]
        client.fetch('%s/sdk/install' % addr,
                     self.handle_response,
                     method='POST', headers=headers, body=body)

    def handle_response(self, response):
        self.set_header('Content-type', 'application/json')
        if (response.code == 200):
            self.write(json.dumps({ 'ok': json.loads(response.body) }))
        else:
            self.write(json.dumps({ 'ok': False,
                                    'error': response.body,
                                    }))
        self.finish()
        
    def encode_multipart_formdata(self, package):
        boundary = '----------%s' % ''.join([ random.choice('0123456789abcdef') for i in range(22) ])
        body = []

        body.append('--%s' % boundary)
        body.append('Content-Disposition: form-data; name="package"; filename="%s.tgz"' % package.uid)
        body.append('Content-Type: application/octet-stream')
        body.append('')
        body.append(package.read())
        
        body.append('--%s--' % boundary)
        body.append('')

        content_type = 'multipart/form-data; boundary=%s' % boundary

        return content_type, '\r\n'.join(body)

class ConfigurationGet(web.RequestHandler):
    def get(self):
        try:
            config = json.loads(open(CONFIG_FILE).read())
        except:
            config = {}
        self.set_header('Content-type', 'application/json')
        self.write(json.dumps(config))

class ConfigurationSet(web.RequestHandler):
    def post(self):
        config = json.loads(self.request.body)
        open(CONFIG_FILE, 'w').write(json.dumps(config))
        self.set_header('Content-type', 'application/json')
        self.write(json.dumps(True))

class BulkTemplateLoader(web.RequestHandler):
    def get(self):
        self.set_header('Content-type', 'text/javascript')
        basedir = TEMPLATE_DIR
        for template in os.listdir(basedir):
            if not re.match('^[a-z0-9_-]+\.html$', template):
                continue
            contents = open(os.path.join(basedir, template)).read()
            template = template[:-5]
            self.write("TEMPLATES['%s'] = '%s';\n\n"
                       % (template, 
                          escape.squeeze(contents.replace("'", "\\'"))
                          )
                       )

def run():
    application = web.Application([
            (r"/bundles", BundleList),
            (r"/effects/(.+)", EffectList),
            (r"/effect/save", EffectSave),
            (r"/config/get", ConfigurationGet),
            (r"/config/set", ConfigurationSet),
            (r"/(icon.html)?", Index),
            (r"/screenshot", Screenshot),
            (r"/install/(.+)/?", BundleInstall),
            (r"/js/templates.js$", BulkTemplateLoader),
            (r"/(.*)", web.StaticFileHandler, {"path": HTML_DIR}),
            ],
                                  debug=True)
    
    application.listen(PORT)
    options.parse_command_line()
    ioloop.IOLoop.instance().start()

if __name__ == "__main__":
    run()
