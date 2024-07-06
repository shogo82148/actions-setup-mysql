use v5.40;
use utf8;
use Test::More;
use FindBin;
use lib "$FindBin::Bin/lib";
use Util qw(run);

$ENV{MYSQL_PWD} = 'very-very-secret';
ok eval { run('mysql', '--host=127.0.0.1', '--user=root', '-e', 'SELECT 1') }, "connect to the server as root user";

$ENV{MYSQL_PWD} = 'secret';
ok eval { run('mysql', '--host=127.0.0.1', '--user=my', '-e', 'SELECT 1') }, "connect to the server as a custom user";

done_testing;
