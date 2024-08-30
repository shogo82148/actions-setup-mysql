use v5.40;
use utf8;
use Test::More;
use FindBin;
use lib "$FindBin::Bin/lib";
use Util qw(run detect_version);

my ($version, $distribution) = detect_version('root', 'very-very-secret');

my ($command, @options);
if ($distribution eq 'mysql') {
  $command = 'mysql';
} elsif ($distribution eq 'mariadb') {
  $command = 'mariadb';
  @options = ('--skip-ssl');
}

local $ENV{MYSQL_PWD} = 'very-very-secret';
ok run($command, '--host=127.0.0.1', '--user=root', '-e', @options, 'SELECT 1'), "connect to the server as root user";

local $ENV{MYSQL_PWD} = 'secret';
ok run($command, '--host=127.0.0.1', '--user=my', '-e', @options, 'SELECT 1'), "connect to the server as a custom user";

done_testing;
