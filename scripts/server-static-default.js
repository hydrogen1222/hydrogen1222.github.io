'use strict';

const originalServer = hexo.extend.console.get('server');

if (originalServer) {
  const wrappedServer = function(args = {}) {
    if (!args.s && !args.static) {
      args = Object.assign({}, args, {
        s: true,
        static: true
      });
      this.env.args = Object.assign({}, this.env.args, {
        s: true,
        static: true
      });

      this.log.info('Static server mode enabled for reliable audio seek support.');
      this.log.info('Run `hexo generate --watch` in another terminal if you want auto-regeneration while editing.');
    }

    return originalServer.call(this, args);
  };

  hexo.extend.console.register(
    'server',
    originalServer.desc,
    originalServer.options,
    wrappedServer
  );
}
