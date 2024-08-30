use v5.40;
use utf8;
use Test::More;
use FindBin;
use lib "$FindBin::Bin/lib";
use Util qw(run detect_version);

my ($version, $distribution) = detect_version('root', 'very-very-secret');

my ($command, @options);
if ($distribution eq 'mysql') {
    $command = 'mysqladmin';
} elsif ($distribution eq 'mariadb') {
    $command = $version =~ /^10[.][23]/ ? 'mysqladmin' : 'mariadb-admin';
    @options = ('--skip-ssl');
}

local $ENV{MYSQL_PWD} = 'very-very-secret';
ok run($command, '--host=127.0.0.1', '--user=root', @options, 'ping'), "ping";

done_testing;
