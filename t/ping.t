use v5.40;
use utf8;
use Test::More;
use FindBin;
use lib "$FindBin::Bin/lib";
use Util qw(run detect_version);

my ($version, $distribution) = detect_version('root', 'very-very-secret');

if ($distribution eq 'mysql') {

  local $ENV{MYSQL_PWD} = 'very-very-secret';
  ok eval { run('mysqladmin', '--host=127.0.0.1', '--user=root', 'ping') }, "ping";

} elsif ($distribution eq 'mariadb') {

  local $ENV{MYSQL_PWD} = 'very-very-secret';
  ok eval { run('mariadb-admin', '--host=127.0.0.1', '--user=root', '--skip-ssl', 'ping') }, "ping";

}

done_testing;
