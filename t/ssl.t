use v5.40;
use utf8;
use Test::More;
use FindBin;
use lib "$FindBin::Bin/lib";
use Util qw(run detect_version);
use File::Spec;

my ($version, $distribution) = detect_version('root', 'very-very-secret');
my @ssl_options = ('--ssl');
if ($distribution eq 'mysql') {
    if ($version =~ /^(?:8\.[0-9]\.|5\.7\.)/) {
        # --ssl-mode is available from MySQL 5.7
        @ssl_options = ('--ssl-mode=REQUIRED');
    } else {
        my $basedir = $ENV{BASE_DIR};
        die 'base-dir is not set' unless $basedir;
        my $capath = File::Spec->catfile($basedir, 'var', 'ca.pem');
        @ssl_options = ('--ssl', "--ssl-ca=$capath");
    }
}

$ENV{MYSQL_PWD} = 'very-very-secret';
my @command = ('mysql', '--host=127.0.0.1', '--user=root', @ssl_options, '-e', "SHOW SESSION STATUS LIKE 'Ssl_cipher'");
my $cipher = run(@command);
like $cipher, qr/^Ssl_cipher\s+\S+\s*$/m, 'Ssl_cipher is set';

done_testing;
