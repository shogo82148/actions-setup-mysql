use v5.40;
use utf8;
use Test::More;
use FindBin;
use lib "$FindBin::Bin/lib";
use Util qw(run detect_version);

my ($version, $distribution) = detect_version('root', 'very-very-secret');

if ($distribution eq 'mysql') {
  local $ENV{MYSQL_PWD} = 'very-very-secret';
  ok eval { run('mysql', '--host=127.0.0.1', '--user=root', '-e', 'SELECT 1') }, "connect to the server as root user";

  local $ENV{MYSQL_PWD} = 'secret';
  ok eval { run('mysql', '--host=127.0.0.1', '--user=my', '-e', 'SELECT 1') }, "connect to the server as a custom user";
} elsif ($distribution eq 'mariadb') {
  local $ENV{MYSQL_PWD} = 'very-very-secret';
  ok eval { run('mariadb', '--host=127.0.0.1', '--user=root', '--skip-ssl', '-e', 'SELECT 1') }, "connect to the server as root user";

  local $ENV{MYSQL_PWD} = 'secret';
  ok eval { run('mariadb', '--host=127.0.0.1', '--user=my', '--skip-ssl', '-e', 'SELECT 1') }, "connect to the server as a custom user";
}

done_testing;
